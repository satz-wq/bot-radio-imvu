import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Diagnóstico de Variáveis de Ambiente
    if (!url || !key) {
      console.error('❌ ERRO NO .ENV.LOCAL: Variáveis do Supabase não encontradas.');
      return NextResponse.json(
        { error: 'Variáveis de ambiente ausentes no .env.local' },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key);

    const { data, error } = await supabase
      .from('playlist')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('❌ ERRO DO SUPABASE:', error.message);
      return NextResponse.json({ error: error.message, playlist: [] }, { status: 500 });
    }

    return NextResponse.json({ playlist: data || [] });
  } catch (err) {
    console.error('❌ ERRO INESPERADO EM /api/playlist:', err.message);
    return NextResponse.json({ error: err.message, playlist: [] }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json({ error: 'Configuração do Supabase ausente' }, { status: 500 });
    }

    const supabase = createClient(url, key);
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID não informado.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('playlist')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}