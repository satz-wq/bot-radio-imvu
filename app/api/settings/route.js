import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { activeGenre } = await request.json();

    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'active_genre', value: activeGenre });

    if (error) throw error;

    return NextResponse.json({ success: true, activeGenre });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}