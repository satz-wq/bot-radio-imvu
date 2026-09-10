import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ytdl from '@distube/ytdl-core';

// Estende o tempo de execução na Vercel para até 60 segundos
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { url, genre } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL não informada.' }, { status: 400 });
    }

    // Aceita links diretos de arquivos MP3 (ex: Supabase Storage)
    if (url.includes('.mp3') || url.includes('supabase.co')) {
      const title = url.split('/').pop().split('?')[0] || 'Música Direta MP3';
      const { error: dbError } = await supabase
        .from('playlist')
        .insert([{ title, url, genre: genre || 'Geral' }]);

      if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);
      return NextResponse.json({ success: true, title, audioUrl: url });
    }

    // Normaliza URLs do formato compartilhado (youtu.be/) para o formato padrão
    let videoUrl = url.trim();
    if (videoUrl.includes('youtu.be/')) {
      const videoId = videoUrl.split('youtu.be/')[1].split('?')[0];
      videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }

    if (!ytdl.validateURL(videoUrl)) {
      return NextResponse.json({ error: 'URL do YouTube inválida.' }, { status: 400 });
    }

    // Configuração de cabeçalhos para simular navegação humana
    const ytdlOptions = {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      },
    };

    // 1. Obter detalhes do vídeo
    const info = await ytdl.getInfo(videoUrl, ytdlOptions);
    const title = info.videoDetails?.title || 'Música sem título';

    // 2. Baixar o fluxo de áudio
    const audioStream = ytdl(videoUrl, {
      ...ytdlOptions,
      filter: 'audioonly',
      quality: 'highestaudio',
    });

    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    // 3. Upload para o Supabase Storage
    const fileName = `musica-${Date.now()}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from('musicas')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg' });

    if (uploadError) throw new Error(`Erro Storage: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from('musicas')
      .getPublicUrl(fileName);

    const publicAudioUrl = publicUrlData.publicUrl;

    // 4. Salvar registro no banco
    const { error: dbError } = await supabase
      .from('playlist')
      .insert([{ title, url: publicAudioUrl, genre: genre || 'Geral' }]);

    if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);

    return NextResponse.json({ success: true, title, audioUrl: publicAudioUrl });

  } catch (err) {
    console.error('Erro na conversão:', err);
    
    if (err.message.includes('not a bot') || err.message.includes('Sign in')) {
      return NextResponse.json({ 
        error: 'Bloqueio temporário de IP do YouTube. Tente novamente em alguns instantes ou envie a URL inteira (https://www.youtube.com/watch?v=...).' 
      }, { status: 403 });
    }

    return NextResponse.json({ error: err.message || 'Erro ao processar áudio.' }, { status: 500 });
  }
}