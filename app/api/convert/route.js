import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFilePromise = promisify(execFile);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // A variável 'request' só existe dentro da função POST
    const { url, genre } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL do YouTube não informada.' }, { status: 400 });
    }

    const isWindows = process.platform === 'win32';
    const binFolder = path.join(process.cwd(), 'bin');
    
    // Define o executável conforme o sistema (Windows local vs Linux Vercel)
    const ytDlpPath = isWindows 
      ? path.join(binFolder, 'yt-dlp.exe') 
      : 'yt-dlp';

    // 1. Extrair e converter o áudio
    const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp3`);

    const ytArgs = [
      url,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '128K',
      '-o', tempFilePath,
      '--no-check-certificates'
    ];

    if (isWindows) {
      ytArgs.push('--ffmpeg-location', binFolder);
    }

    await execFilePromise(ytDlpPath, ytArgs);

    // 2. Obter título do vídeo
    const { stdout: jsonOutput } = await execFilePromise(ytDlpPath, [
      url,
      '--dump-single-json',
      '--no-warnings'
    ]);
    const info = JSON.parse(jsonOutput);
    const title = info.title || 'Música sem título';

    // 3. Ler o MP3 e enviar para o Supabase Storage
    const audioBuffer = fs.readFileSync(tempFilePath);
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    const fileName = `musica-${Date.now()}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from('musicas')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg' });

    if (uploadError) throw new Error(`Erro Storage: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from('musicas')
      .getPublicUrl(fileName);

    const publicAudioUrl = publicUrlData.publicUrl;

    // 4. Inserir na tabela 'playlist' com a categoria/gênero
    const { error: dbError } = await supabase
      .from('playlist')
      .insert([{ title, url: publicAudioUrl, genre: genre || 'Geral' }]);

    if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);

    return NextResponse.json({ success: true, title, audioUrl: publicAudioUrl });

  } catch (err) {
    console.error('Erro na conversão:', err);
    return NextResponse.json({ error: err.message || 'Erro ao processar áudio.' }, { status: 500 });
  }
}