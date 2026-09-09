const http = require('http');
const https = require('https');
const Throttle = require('throttle');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let clients = [];
let audioBufferRing = [];
const MAX_RING_SIZE = 35;

const server = http.createServer((req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);

  // Rota de Health Check para aprovação do deploy no Render
  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }

  // Rota da Rádio
  if (req.url === '/' || req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
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

// Algoritmo para embaralhar o array sem repetir até completar o ciclo
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
    // 1. Consulta qual playlist está selecionada no painel
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'active_genre')
      .single();

    const activeGenre = setting?.value || 'TODAS';

    // 2. Busca as músicas filtrando pelo gênero ativo
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

    // 3. Embaralha a lista completa
    const shuffledPlaylist = shuffleArray(playlist);
    console.log(`\n🔀 Nova rodada iniciada [Playlist: ${activeGenre}] - ${shuffledPlaylist.length} músicas na fila.`);

    // 4. Toca todas as músicas do ciclo antes de embaralhar novamente
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

// Define a porta enviada pelo Render (ou 8000 como fallback local)
const PORT = process.env.PORT || 8000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`Servidor de Rádio 24/7 rodando na porta ${PORT}`);
  console.log('====================================================');
  playNextSong();
});