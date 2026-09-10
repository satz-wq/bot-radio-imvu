import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { url, genre } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL não informada.' }, { status: 400 });
    }

    // 1. Links MP3 diretos/Supabase são salvos sem acionar o Render
    if (url.includes('.mp3') || url.includes('supabase.co') || url.includes('.m4a')) {
      const title = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'Música MP3';
      const { error: dbError } = await supabase
        .from('playlist')
        .insert([{ title, url, genre: genre || 'Geral' }]);

      if (dbError) throw new Error(`Erro no Banco: ${dbError.message}`);
      return NextResponse.json({ success: true, title, audioUrl: url });
    }

    // 2. Requisição ao Render
    let renderRes;
    try {
      renderRes = await fetch('https://nodrama-radio.onrender.com/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (fetchErr) {
      throw new Error('O servidor do Render está indisponível ou reiniciando. Aguarde 15 segundos.');
    }

    // Captura a resposta bruta em texto para evitar o erro de parse de HTML
    const responseText = await renderRes.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Render devolveu HTML em vez de JSON:', responseText);
      throw new Error('O servidor do Render retornou uma resposta inválida. Tente novamente em instantes.');
    }

    if (!renderRes.ok) {
      throw new Error(data.error || 'Erro no servidor de conversão do Render.');
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Erro na rota convert:', err);
    return NextResponse.json({ 
      error: err.message || 'Falha na comunicação com o servidor.' 
    }, { status: 500 });
  }
}