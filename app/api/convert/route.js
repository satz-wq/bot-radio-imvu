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

    // Links MP3 / Supabase diretos são salvos diretamente no Supabase pela Vercel
    if (url.includes('.mp3') || url.includes('supabase.co') || url.includes('.m4a')) {
      const title = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'Música MP3';
      const { error: dbError } = await supabase
        .from('playlist')
        .insert([{ title, url, genre: genre || 'Geral' }]);

      if (dbError) throw new Error(`Erro no Banco: ${dbError.message}`);
      return NextResponse.json({ success: true, title, audioUrl: url });
    }

    // Encaminha requisições do YouTube para o Render
    const renderRes = await fetch('https://nodrama-radio.onrender.com/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await renderRes.json();

    if (!renderRes.ok) {
      throw new Error(data.error || 'Erro no servidor de conversão do Render.');
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Erro na rota convert:', err);
    return NextResponse.json({ 
      error: err.message || 'Falha ao se comunicar com o servidor de conversão.' 
    }, { status: 500 });
  }
}