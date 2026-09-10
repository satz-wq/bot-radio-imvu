import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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

    // 1. Suporte para link MP3 direto (Supabase, CDN, etc)
    if (url.includes('.mp3') || url.includes('supabase.co') || url.includes('.m4a') || url.includes('cdn')) {
      const title = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'Música MP3';
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

    // 2. Fila de serviços de extração
    const apis = [
      // Motor 1: Loader Engine
      async () => {
        const initRes = await fetch(`https://loader.to/api/ajax/download.php?format=mp3&url=${encodeURIComponent(cleanUrl)}`, { cache: 'no-store' });
        if (!initRes.ok) return null;
        const initData = await initRes.json();
        
        if (initData.id) {
          for (let i = 0; i < 6; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const progRes = await fetch(`https://loader.to/api/ajax/progress.php?id=${initData.id}`, { cache: 'no-store' });
            if (!progRes.ok) continue;
            const progData = await progRes.json();
            if (progData.download_url) {
              return { downloadUrl: progData.download_url, title: progData.title };
            }
          }
        }
        return null;
      },
      // Motor 2: Instância Cobalt dedicada
      async () => {
        const res = await fetch('https://cobalt-api.kwiqk.com/', {
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
        if (data.url) return { downloadUrl: data.url, title: data.filename || 'Música do YouTube' };
        return null;
      }
    ];

    let result = null;
    for (const api of apis) {
      try {
        result = await api();
        if (result?.downloadUrl) break;
      } catch (e) {
        continue;
      }
    }

    if (!result || !result.downloadUrl) {
      throw new Error('O YouTube bloqueou a conversão deste vídeo no momento. Tente outro link ou envie o arquivo MP3.');
    }

    const title = result.title || 'Música do YouTube';

    // 3. Download do áudio extraído
    const audioRes = await fetch(result.downloadUrl);
    if (!audioRes.ok) throw new Error('Falha ao baixar o arquivo do servidor de conversão.');

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

    // 5. Inserir registro no banco
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