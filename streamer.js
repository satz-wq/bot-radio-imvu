const http = require('http');
const https = require('https');
const Throttle = require('throttle');
const { createClient } = require('@supabase/supabase-js');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let clients = [];
let audioBufferRing = [];
const MAX_RING_SIZE = 35;

const server = http.createServer(async (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  // Rota de Conversão
  if (req.url === '/convert' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { url, genre } = JSON.parse(body || '{}');
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'URL não informada.' }));
        }

        // Se for arquivo MP3 / Supabase direto
        if (url.includes('.mp3') || url.includes('supabase.co') || url.includes('.m4a')) {
          const title = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'Música MP3';
          const { error: dbErr } = await supabase
            .from('playlist')
            .insert([{ title, url, genre: genre || 'Geral' }]);

          if (dbErr) throw dbErr;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, title, audioUrl: url }));
        }

        const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp3`);
        const cookiesPath = path.join(process.cwd(), 'cookies.txt');

        // Configuração do yt-dlp com autenticação por cookies
        const ytOptions = {
          extractAudio: true,
          audioFormat: 'mp3',
          audioQuality: '128K',
          output: tempFilePath,
          noCheckCertificates: true,
          noWarnings: true,
        };

        // Adiciona os cookies se o arquivo existir na raiz
        if (fs.existsSync(cookiesPath)) {
          ytOptions.cookies = cookiesPath;
        }

        await ytDlp(url, ytOptions);

        let title = 'Música do YouTube';
        try {
          const infoOpt = { dumpSingleJson: true, noWarnings: true };
          if (fs.existsSync(cookiesPath)) infoOpt.cookies = cookiesPath;
          const info = await ytDlp(url, infoOpt);
          title = info.title || title;
        } catch (e) {}

        const audioBuffer = fs.readFileSync(tempFilePath);
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        const fileName = `musica-${Date.now()}.mp3`;
        const { error: uploadError } = await supabase.storage
          .from('musicas')
          .upload(fileName, audioBuffer, { contentType: 'audio/mpeg' });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('musicas')
          .getPublicUrl(fileName);

        const publicAudioUrl = publicUrlData.publicUrl;

        const { error: dbError } = await supabase
          .from('playlist')
          .insert([{ title, url: publicAudioUrl, genre: genre || 'Geral' }]);

        if (dbError) throw dbError;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, title, audioUrl: publicAudioUrl }));

      } catch (err) {
        console.error('Erro no download (Render):', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message || 'Erro ao converter música no servidor.' }));
      }
    });
    return;
  }

  // Rota de Transmissão 24/7
  if (req.url === '/' || req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    audioBufferRing.forEach(chunk => {
      try { res.write(chunk); } catch (e) {}
    });

    clients.push(res);
    console.log(`[+] Novo ouvinte conectado! Total: ${clients.length}`);

    req.on('close', () => {
      clients = clients.filter(client => client !== res);
      console.log(`[-] Ouvinte desconectado. Total: ${clients.length}`);
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Rota não encontrada');
  }
});

server.timeout = 0;
server.keepAliveTimeout = 0;

function broadcast(chunk) {
  audioBufferRing.push(chunk);
  if (audioBufferRing.length > MAX_RING_SIZE) audioBufferRing.shift();

  clients.forEach(client => {
    try { client.write(chunk); } catch (e) {}
  });
}

function getStream(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(getStream(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Erro HTTP ${res.statusCode} ao baixar do Supabase`));
      }
      resolve(res);
    }).on('error', reject);
  });
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function playNextSong() {
  try {
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'active_genre')
      .single();

    const activeGenre = setting?.value || 'TODAS';

    let query = supabase.from('playlist').select('*');
    if (activeGenre !== 'TODAS') {
      query = query.eq('genre', activeGenre);
    }

    const { data: playlist, error } = await query;

    if (error || !playlist || playlist.length === 0) {
      console.log(`Playlist [${activeGenre}] está vazia. Aguardando músicas...`);
      setTimeout(playNextSong, 5000);
      return;
    }

    const shuffledPlaylist = shuffleArray(playlist);
    console.log(`\n🔀 Nova rodada iniciada [Playlist: ${activeGenre}] - ${shuffledPlaylist.length} músicas na fila.`);

    for (const song of shuffledPlaylist) {
      console.log(`▶ Tocando agora [${song.genre || 'Geral'}]: ${song.title}`);
      await streamAudioUrl(song.url);
    }

    playNextSong();
  } catch (err) {
    console.error('Erro no transmissor:', err.message);
    setTimeout(playNextSong, 5000);
  }
}

function streamAudioUrl(url) {
  return new Promise(async (resolve) => {
    try {
      const response = await getStream(url);
      const throttle = new Throttle(18000); 

      response.pipe(throttle);

      throttle.on('data', (chunk) => broadcast(chunk));
      throttle.on('end', () => resolve());
      throttle.on('error', () => resolve());
      response.on('error', () => resolve());

    } catch (err) {
      console.error('❌ Falha ao carregar áudio:', err.message);
      resolve();
    }
  });
}

const PORT = process.env.PORT || 8000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de Rádio 24/7 rodando na porta ${PORT}`);
  playNextSong();
});