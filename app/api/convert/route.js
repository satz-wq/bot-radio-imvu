import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ytdl from '@distube/ytdl-core';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Extrai o ID limpo do vídeo
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

    // Aceita link direto de MP3 (ex: Supabase Storage)
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
    let audioBuffer = null;
    let title = 'Música do YouTube';

    // METODO 1: @distube/ytdl-core usando clientes ANDROID e IOS (bypassa bot check)
    try {
      const ytdlOptions = {
        playerClients: ['ANDROID', 'IOS'],
        requestOptions: {
          headers: {
            'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11; pt_BR)',
          },
        },
      };

      const info = await ytdl.getInfo(cleanUrl, ytdlOptions);
      title = info.videoDetails?.title || title;

      const audioStream = ytdl(cleanUrl, {
        ...ytdlOptions,
        filter: 'audioonly',
        quality: 'highestaudio',
      });

      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      audioBuffer = Buffer.concat(chunks);
    } catch (e1) {
      console.warn('Método 1 (ytdl-core) falhou, tentando fallback Invidious...', e1.message);

      // METODO 2: Fallback via instâncias Invidious
      const invidiousInstances = [
        `https://inv.tux.pizza/api/v1/videos/${videoId}`,
        `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
        `https://vid.puffyan.us/api/v1/videos/${videoId}`
      ];

      for (const instance of invidiousInstances) {
        try {
          const res = await fetch(instance, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            title = data.title || title;
            const audioFormat = data.adaptiveFormats?.find(f => f.type?.includes('audio'));
            
            if (audioFormat && audioFormat.url) {
              const audioRes = await fetch(audioFormat.url);
              if (audioRes.ok) {
                const arrayBuf = await audioRes.arrayBuffer();
                audioBuffer = Buffer.from(arrayBuf);
                break;
              }
            }
          }
        } catch (err) {
          continue;
        }
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Não foi possível extrair o áudio deste vídeo. Tente outro link do YouTube.');
    }

    // Upload para o Supabase Storage
    const fileName = `musica-${Date.now()}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from('musicas')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg' });

    if (uploadError) throw new Error(`Erro Storage: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from('musicas')
      .getPublicUrl(fileName);

    const publicAudioUrl = publicUrlData.publicUrl;

    // Salvar registro na tabela 'playlist'
    const { error: dbError } = await supabase
      .from('playlist')
      .insert([{ title, url: publicAudioUrl, genre: genre || 'Geral' }]);

    if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);

    return NextResponse.json({ success: true, title, audioUrl: publicAudioUrl });

  } catch (err) {
    console.error('Erro na conversão:', err);
    return NextResponse.json({ 
      error: err.message || 'Erro ao processar áudio.' 
    }, { status: 500 });
  }
}