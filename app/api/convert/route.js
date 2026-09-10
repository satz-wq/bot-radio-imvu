import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Extrai o ID do vídeo do YouTube
function extractVideoId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

export async function POST(request) {
  try {
    const { url, genre } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL não informada.' }, { status: 400 });
    }

    // 1. Suporte para link direto de MP3 (ex: Supabase Storage)
    if (url.includes('.mp3') || url.includes('supabase.co')) {
      const title = url.split('/').pop().split('?')[0] || 'Música Direta MP3';
      const { error: dbError } = await supabase
        .from('playlist')
        .insert([{ title, url, genre: genre || 'Geral' }]);

      if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);
      return NextResponse.json({ success: true, title, audioUrl: url });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Link do YouTube inválido.' }, { status: 400 });
    }

    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 2. Provedores de conversão em sequência
    const providers = [
      // Provedor 1: Agatz YTmp3 API
      async () => {
        const res = await fetch(`https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(cleanUrl)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status === 200 && data.data?.downloadUrl) {
          return { downloadUrl: data.data.downloadUrl, title: data.data.title };
        }
        return null;
      },
      // Provedor 2: Dreaded YTDL Bridge
      async () => {
        const res = await fetch(`https://api.dreaded.site/api/ytdl/audio?url=${encodeURIComponent(cleanUrl)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.success && data.result?.downloadUrl) {
          return { downloadUrl: data.result.downloadUrl, title: data.result.title };
        }
        return null;
      },
      // Provedor 3: Invidious Direct Audio Stream
      async () => {
        const res = await fetch(`https://inv.tux.pizza/api/v1/videos/${videoId}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        const audioFormat = data.adaptiveFormats?.find(f => f.type?.includes('audio'));
        if (audioFormat?.url) {
          return { downloadUrl: audioFormat.url, title: data.title };
        }
        return null;
      }
    ];

    let extractedData = null;
    for (const provider of providers) {
      try {
        extractedData = await provider();
        if (extractedData?.downloadUrl) break;
      } catch (e) {
        continue;
      }
    }

    if (!extractedData || !extractedData.downloadUrl) {
      throw new Error('Vídeo protegido ou indisponível. Tente outro link do YouTube ou um link MP3 direto.');
    }

    const title = extractedData.title || 'Música do YouTube';

    // 3. Baixar o áudio extraído
    const audioRes = await fetch(extractedData.downloadUrl);
    if (!audioRes.ok) throw new Error('Falha ao baixar o arquivo de áudio do servidor de conversão.');

    const arrayBuf = await audioRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);

    // 4. Upload para o Supabase Storage
    const fileName = `musica-${Date.now()}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from('musicas')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg' });

    if (uploadError) throw new Error(`Erro Storage: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from('musicas')
      .getPublicUrl(fileName);

    const publicAudioUrl = publicUrlData.publicUrl;

    // 5. Inserir na tabela 'playlist'
    const { error: dbError } = await supabase
      .from('playlist')
      .insert([{ title, url: publicAudioUrl, genre: genre || 'Geral' }]);

    if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);

    return NextResponse.json({ success: true, title, audioUrl: publicAudioUrl });

  } catch (err) {
    console.error('Erro na conversão:', err);
    return NextResponse.json({ 
      error: err.message || 'Erro ao processar música.' 
    }, { status: 500 });
  }
}