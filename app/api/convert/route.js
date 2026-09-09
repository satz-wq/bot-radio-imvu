// Captura a URL e a Categoria enviadas pelo front-end
const { url, genre } = await request.json();

// ... [restante do código de conversão do yt-dlp/ffmpeg] ...

// Na hora de salvar no banco:
const { error: dbError } = await supabase
  .from('playlist')
  .insert([{ title, url: publicAudioUrl, genre: genre || 'Geral' }]);