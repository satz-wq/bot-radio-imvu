import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();

    // Encaminha a requisição da Vercel para o servidor no Render
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
    console.error('Erro na ponte Vercel -> Render:', err);
    return NextResponse.json({ 
      error: err.message || 'Falha ao se comunicar com o servidor de conversão.' 
    }, { status: 500 });
  }
}