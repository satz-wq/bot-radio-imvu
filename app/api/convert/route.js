import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Aceita link direto de arquivo MP3 / Supabase Storage
    if (url.includes('.mp3') || url.includes('supabase.co')) {
      const title = url.split('/').pop().split('?')[0] || 'Música Direta MP3';
      const { error: dbError } = await supabase
        .from('playlist')
        .insert([{ title, url, genre: genre || 'Geral' }]);

      if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);
      return NextResponse.json({ success: true, title, audioUrl: url });
    }

    // Normaliza a URL do YouTube
    let cleanUrl = url.trim();
    if (cleanUrl.includes('youtu.be/')) {
      const videoId = cleanUrl.split('youtu.be/')[1].split('?')[0];
      cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }

    // 1. Requisitar extração na API Cobalt v10 (endpoint: https://api.cobalt.tools/)
    const cobaltRes = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        url: cleanUrl,
        downloadMode: 'audio',
        audioFormat: 'mp3',
      }),
    });

    const cobaltData = await cobaltRes.json();

    if (!cobaltRes.ok || cobaltData.status === 'error') {
      const errorMsg = cobaltData.text || cobaltData.error?.code || 'O YouTube rejeitou a requisição.';
      throw new Error(`Cobalt API: ${errorMsg}`);
    }

    const audioDownloadUrl = cobaltData.url;
    if (!audioDownloadUrl) {
      throw new Error('Não foi possível obter o link de áudio.');
    }

    // 2. Baixar o arquivo MP3 gerado
    const audioFileRes = await fetch(audioDownloadUrl);
    if (!audioFileRes.ok) throw new Error('Falha ao obter o arquivo de áudio convertido.');

    const audioArrayBuffer = await audioFileRes.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    // 3. Extrair o título do arquivo
    let title = 'Música do YouTube';
    if (cobaltData.filename) {
      title = cobaltData.filename.replace(/\.[^/.]+$/, '');
    }

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

    // 5. Salvar registro na tabela 'playlist'
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