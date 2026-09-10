'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  Music,
  Link2,
  Loader2,
  Radio,
  Trash2,
  ListMusic,
  Plus,
  Copy,
  CheckCircle2,
  LogOut,
  Disc,
  Filter,
  Sparkles,
  Upload,
  Clock,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const GENRES = ['Geral', 'Reggae', 'MPB', 'Funk'];

export default function Home() {
  const router = useRouter();

  const [authLoading, setAuthLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [genre, setGenre] = useState('Geral');
  const [activeGenre, setActiveGenre] = useState('TODAS');
  const [filterGenre, setFilterGenre] = useState('TODAS');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [fetchingPlaylist, setFetchingPlaylist] = useState(true);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const pollIntervalRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      } else {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const refreshPlaylist = async () => {
    try {
      const res = await fetch('/api/playlist');
      const data = await res.json();
      if (data.playlist) {
        setPlaylist(data.playlist);
      }
    } catch (err) {
      console.error('Erro ao carregar playlist:', err);
    } finally {
      setFetchingPlaylist(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    async function loadInitialData() {
      try {
        const res = await fetch('/api/playlist');
        const data = await res.json();
        if (active && data.playlist) {
          setPlaylist(data.playlist);
        }
      } catch (err) {
        console.error('Erro ao carregar playlist:', err);
      } finally {
        if (active) setFetchingPlaylist(false);
      }
    }

    loadInitialData();
    return () => {
      active = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [authLoading]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleActiveGenreChange = async (newGenre) => {
    setActiveGenre(newGenre);
    setUpdatingSettings(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeGenre: newGenre }),
      });
    } catch (err) {
      console.error('Erro ao atualizar playlist ativa:', err);
    } finally {
      setUpdatingSettings(false);
    }
  };

  // Dispara busca periódica de músicas após envio
  const startPollingPlaylist = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    let attempts = 0;
    pollIntervalRef.current = setInterval(async () => {
      attempts += 1;
      await refreshPlaylist();

      // Para de buscar após 8 tentativas (40 segundos)
      if (attempts >= 8) {
        clearInterval(pollIntervalRef.current);
        setInfoMessage('');
      }
    }, 5000);
  };

  // Envio por Link do YouTube
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, genre }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Servidor instável. Tente novamente em alguns instantes.');
      }

      if (!res.ok) throw new Error(data.error || 'Erro ao adicionar música.');

      setUrl('');
      setInfoMessage('⏳ Música enviada para conversão! Aguarde ~30 segundos para ela aparecer na lista...');
      
      // Atualiza a lista imediatamente e ativa a verificação automática a cada 5s
      await refreshPlaylist();
      startPollingPlaylist();

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Envio Direto de Arquivo MP3 do Computador
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const fileName = `musica-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const { error: uploadError } = await supabase.storage
        .from('musicas')
        .upload(fileName, file, { contentType: file.type || 'audio/mpeg' });

      if (uploadError) throw new Error(`Erro Storage: ${uploadError.message}`);

      const { data: publicUrlData } = supabase.storage
        .from('musicas')
        .getPublicUrl(fileName);

      const publicAudioUrl = publicUrlData.publicUrl;
      const songTitle = file.name.replace(/\.[^/.]+$/, '');

      const { error: dbError } = await supabase
        .from('playlist')
        .insert([{ title: songTitle, url: publicAudioUrl, genre }]);

      if (dbError) throw new Error(`Erro Banco: ${dbError.message}`);

      await refreshPlaylist();
      setInfoMessage('✅ Arquivo MP3 adicionado à rádio com sucesso!');
      setTimeout(() => setInfoMessage(''), 4000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch('/api/playlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error('Erro ao excluir faixa.');
      setPlaylist((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const copyLink = (id, songUrl) => {
    navigator.clipboard.writeText(songUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredPlaylist = filterGenre === 'TODAS'
    ? playlist
    : playlist.filter((s) => (s.genre || 'Geral') === filterGenre);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-purple-300 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
        <span className="ml-3 text-zinc-400 text-sm tracking-wider uppercase font-semibold">
          Iniciando Drama Radio...
        </span>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 p-4 md:p-8 flex flex-col items-center selection:bg-purple-600 selection:text-white">
      <div className="w-full max-w-2xl space-y-6">

        <div className="flex justify-between items-center w-full border-b border-purple-950/60 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
            <span className="text-xs text-purple-300 tracking-widest font-mono uppercase">
              Drama Admin Panel
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950 hover:bg-purple-950/50 text-xs text-purple-300 hover:text-purple-200 rounded-lg transition-all border border-purple-900/40 hover:border-purple-500/80 shadow-[0_0_10px_rgba(168,85,247,0.1)]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>

        <header className="flex flex-col sm:flex-row items-center justify-between bg-zinc-950/80 border border-purple-900/50 p-6 rounded-2xl shadow-[0_0_30px_rgba(168,85,247,0.15)] backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-purple-600/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-fuchsia-600/20 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col items-center sm:items-start gap-2 z-10">
            <img
              src="/logo-drama.png"
              alt="Drama Logo"
              className="h-16 sm:h-20 w-auto object-contain drop-shadow-[0_0_15px_rgba(168,85,247,0.7)] hover:scale-105 transition-transform duration-300"
            />
            <p className="text-[11px] text-purple-300/80 tracking-widest uppercase font-mono mt-1">
              Transmissão 24/7 & Cyber Stream
            </p>
          </div>

          <div className="mt-4 sm:mt-0 flex items-center gap-2 bg-purple-950/60 border border-purple-500/40 text-purple-300 text-xs px-4 py-2 rounded-full font-medium shadow-[0_0_15px_rgba(168,85,247,0.3)] z-10">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
            <Radio className="w-4 h-4 text-purple-400" />
            Rádio No Ar
          </div>
        </header>

        <section className="bg-zinc-950/80 border border-purple-900/50 p-5 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.1)] backdrop-blur-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs tracking-wider uppercase font-bold text-purple-300 flex items-center gap-2">
              <Disc className="w-4 h-4 text-fuchsia-400 animate-spin-slow" />
              Playlist em Execução
            </h2>
            {updatingSettings && (
              <span className="text-xs text-purple-400 flex items-center gap-1 font-mono">
                <Loader2 className="w-3 h-3 animate-spin" /> Atualizando...
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {['TODAS', 'Reggae', 'MPB', 'Funk', 'Geral'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleActiveGenreChange(item)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold tracking-wider transition-all border ${
                  activeGenre === item
                    ? 'bg-gradient-to-r from-purple-700 to-fuchsia-700 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                    : 'bg-black/60 text-zinc-400 border-purple-900/30 hover:border-purple-600/60 hover:text-purple-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {/* Adicionar Músicas */}
        <section className="bg-zinc-950/80 border border-purple-900/50 p-6 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.1)] backdrop-blur-xl space-y-4">
          <h2 className="text-xs tracking-wider uppercase font-bold text-purple-300 flex items-center gap-2">
            <Plus className="w-4 h-4 text-fuchsia-400" />
            Adicionar Músicas
          </h2>

          <div className="flex items-center gap-3">
            <label className="text-xs text-purple-300/80 shrink-0 uppercase tracking-wider font-mono">Categoria:</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full bg-black/80 border border-purple-900/50 rounded-xl px-3 py-2 text-xs text-purple-200 focus:outline-none focus:border-purple-500"
            >
              {GENRES.map((g) => (
                <option key={g} value={g} className="bg-zinc-950 text-purple-200">{g}</option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cole a URL do YouTube aqui..."
                className="w-full bg-black/80 border border-purple-900/50 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 pl-10 transition-all shadow-inner"
              />
              <Link2 className="w-4 h-4 text-purple-400 absolute left-3 top-3.5" />
            </div>

            <button
              type="submit"
              disabled={loading || !url}
              className="w-full bg-gradient-to-r from-purple-800 via-fuchsia-700 to-purple-800 hover:from-purple-700 hover:to-fuchsia-600 text-white font-bold tracking-wider uppercase text-xs py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_0_20px_rgba(168,85,247,0.4)] border border-purple-500/30"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                  Processando...
                </>
              ) : (
                <>
                  <Music className="w-4 h-4" />
                  Adicionar via YouTube
                </>
              )}
            </button>
          </form>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-purple-900/40"></div>
            <span className="flex-shrink mx-4 text-[10px] text-purple-400/60 uppercase font-mono tracking-widest">ou faça upload direto</span>
            <div className="flex-grow border-t border-purple-900/40"></div>
          </div>

          <label className="w-full bg-zinc-900 hover:bg-purple-950/40 text-purple-300 font-bold tracking-wider uppercase text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-purple-900/40 border-dashed hover:border-purple-500/80">
            <Upload className="w-4 h-4 text-fuchsia-400" />
            Upload de Arquivo MP3 do Computador
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={loading}
            />
          </label>

          {infoMessage && (
            <div className="p-3 bg-purple-950/50 border border-purple-500/50 rounded-xl text-purple-200 text-xs flex items-center gap-2 animate-pulse font-mono">
              <Clock className="w-4 h-4 text-fuchsia-400 shrink-0" />
              {infoMessage}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs">
              {error}
            </div>
          )}
        </section>

        <section className="bg-zinc-950/80 border border-purple-900/50 p-6 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.1)] backdrop-blur-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-950/60 pb-3">
            <h2 className="text-xs tracking-wider uppercase font-bold text-purple-300 flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-fuchsia-400" />
              Fila de Reprodução
            </h2>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-purple-400" />
              <select
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
                className="bg-black/80 border border-purple-900/50 rounded-lg px-2.5 py-1 text-xs text-purple-300 focus:outline-none"
              >
                <option value="TODAS" className="bg-zinc-950">Todas Categorias</option>
                {GENRES.map((g) => (
                  <option key={g} value={g} className="bg-zinc-950">{g}</option>
                ))}
              </select>
              <span className="text-xs bg-purple-950/80 border border-purple-800/50 text-purple-300 px-2.5 py-1 rounded-full font-mono">
                {filteredPlaylist.length} faixas
              </span>
            </div>
          </div>

          {fetchingPlaylist ? (
            <div className="flex items-center justify-center py-8 text-purple-400/60 text-xs gap-2 font-mono">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando dados...
            </div>
          ) : filteredPlaylist.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-purple-900/30 rounded-xl text-zinc-500 text-xs">
              Nenhuma música encontrada nesta categoria.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
              {filteredPlaylist.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center justify-between p-3.5 bg-black/60 border border-purple-950 rounded-xl hover:border-purple-600/50 hover:shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <span className="text-xs font-mono font-bold text-purple-500/60 w-5 text-center">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-200 truncate group-hover:text-purple-300 transition-colors">
                        {song.title}
                      </p>
                      <span className="text-[10px] bg-purple-950/60 border border-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full inline-block mt-0.5 font-mono">
                        {song.genre || 'Geral'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copyLink(song.id, song.url)}
                      title="Copiar link MP3"
                      className="p-2 hover:bg-purple-950/50 rounded-lg text-zinc-400 hover:text-purple-300 transition-all"
                    >
                      {copiedId === song.id ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      onClick={() => handleDelete(song.id)}
                      disabled={deletingId === song.id}
                      title="Excluir da playlist"
                      className="p-2 hover:bg-red-950/40 rounded-lg text-zinc-500 hover:text-red-400 transition-all disabled:opacity-50"
                    >
                      {deletingId === song.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}