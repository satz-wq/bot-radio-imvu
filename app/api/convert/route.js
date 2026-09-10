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

    // 1. Suporte nativo para links MP3 diretos (Supabase, CDN, etc)
    if (url.includes('.mp3') || url.includes('supabase.co') || url.includes('.m4a')) {
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

    // 2. Motores de conversão em cascata
    const engines = [
      // Motor 1: VKR Downloader Service
      async () => {
        const res = await fetch(`https://api.vkrdown.com/v4/youtube?url=${encodeURIComponent(cleanUrl)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        const mp3Stream = data.data?.downloads?.find(d => d.format === 'mp3' || d.extension === 'mp3' || d.type === 'audio');
        if (mp3Stream?.url) {
          return { downloadUrl: mp3Stream.url, title: data.data?.title };
        }
        return null;
      },
      // Motor 2: Agatz YTmp3 Engine
      async () => {
        const res = await fetch(`https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(cleanUrl)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status === 200 && data.data?.downloadUrl) {
          return { downloadUrl: data.data.downloadUrl, title: data.data.title };
        }
        return null;
      },
      // Motor 3: Instância de espelho do Cobalt
      async () => {
        const res = await fetch('https://cobalt.qil.dev/', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          body: JSON.stringify({ url: cleanUrl, downloadMode: 'audio', audioFormat: 'mp3' }),
          cache: 'no-store'
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.url) {
          return { downloadUrl: data.url, title: data.filename || 'Música do YouTube' };
        }
        return null;
      },
      // Motor 4: Invidious Stream Direct
      async () => {
        const res = await fetch(`https://invidious.nerdvpn.de/api/v1/videos/${videoId}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        const audioFormat = data.adaptiveFormats?.find(f => f.type?.includes('audio'));
        if (audioFormat?.url) {
          return { downloadUrl: audioFormat.url, title: data.title };
        }
        return null;
      }
    ];

    let result = null;
    for (const engine of engines) {
      try {
        result = await engine();
        if (result?.downloadUrl) break;
      } catch (e) {
        continue;
      }
    }

    if (!result || !result.downloadUrl) {
      throw new Error('Não foi possível extrair o áudio deste vídeo. Tente outro link do YouTube ou cole o link direto de um arquivo MP3.');
    }

    const title = result.title || 'Música do YouTube';

    // 3. Download do áudio extraído
    const audioRes = await fetch(result.downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!audioRes.ok) throw new Error('Falha ao obter o arquivo do servidor de conversão.');

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

    // 5. Inserção na tabela 'playlist'
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