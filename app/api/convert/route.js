import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Função para extrair o ID do vídeo do YouTube
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

    // Aceita link direto de arquivo MP3 / Supabase Storage
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

    // 1. Consultar instâncias do Piped para obter o fluxo de áudio sem bloqueios
    const pipedEndpoints = [
      `https://api.piped.video/streams/${videoId}`,
      `https://pipedapi.kavin.rocks/streams/${videoId}`,
      `https://pipedapi.tokhmi.xyz/streams/${videoId}`
    ];

    let videoData = null;
    for (const endpoint of pipedEndpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          cache: 'no-store'
        });
        if (res.ok) {
          videoData = await res.json();
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!videoData || !videoData.audioStreams || videoData.audioStreams.length === 0) {
      throw new Error('Não foi possível extrair o áudio deste vídeo do YouTube.');
    }

    // Seleciona a faixa de áudio com melhor qualidade
    const bestAudio = videoData.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    const audioStreamUrl = bestAudio.url;
    const title = videoData.title || 'Música do YouTube';

    // 2. Baixar o arquivo de áudio gerado
    const audioFileRes = await fetch(audioStreamUrl);
    if (!audioFileRes.ok) throw new Error('Falha ao baixar o arquivo de áudio do servidor.');

    const audioArrayBuffer = await audioFileRes.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

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

    // 4. Salvar registro na tabela 'playlist'
    const { error: dbError } = await supabase
      .from('playlist')
      .insert([{ title, url: publicAudioUrl, genre: genre || 'Geral' }]);

    if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);

    return NextResponse.json({ success: true, title, audioUrl: publicAudioUrl });

  } catch (err) {
    console.error('Erro na conversão:', err);
    return NextResponse.json({ 
      error: err.message || 'Erro ao processar música. Tente outro link do YouTube.' 
    }, { status: 500 });
  }
}