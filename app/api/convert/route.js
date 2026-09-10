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

    // 1. Requisitar extração de áudio bypassando o bloqueio de IP do YouTube
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        downloadMode: 'audio',
        audioFormat: 'mp3',
      }),
    });

    const cobaltData = await cobaltRes.json();

    if (!cobaltRes.ok || cobaltData.status === 'error') {
      throw new Error(cobaltData.text || 'O YouTube bloqueou este vídeo temporariamente.');
    }

    const audioDownloadUrl = cobaltData.url;

    // 2. Baixar o arquivo MP3 gerado
    const audioFileRes = await fetch(audioDownloadUrl);
    if (!audioFileRes.ok) throw new Error('Falha ao obter arquivo de áudio.');

    const audioArrayBuffer = await audioFileRes.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    // 3. Obter o título da música
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