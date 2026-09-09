'use client';
import { useState, useEffect } from 'react';
import { Music, Link2, Loader2, Radio, Trash2, ListMusic, Plus, Copy, CheckCircle2 } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [fetchingPlaylist, setFetchingPlaylist] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Busca a playlist atualizada da API
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

  // Carrega a playlist uma única vez ao abrir a página
  useEffect(() => {
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
    };
  }, []);

  // Adicionar nova música
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erro ao adicionar música.');

      setUrl('');
      await refreshPlaylist();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Excluir música da playlist
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-6">
        
        {/* Cabeçalho */}
        <header className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600/20 text-purple-400 rounded-xl border border-purple-500/20">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Painel Rádio IMVU
              </h1>
              <p className="text-xs text-slate-400">Transmissão 24/7 & Gerenciador de Playlist</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-1.5 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Rádio No Ar
          </div>
        </header>

        {/* Formulário de Adicionar Música */}
        <section className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl backdrop-blur-md">
          <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-purple-400" />
            Adicionar Música do YouTube
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cole o link do YouTube aqui..."
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 pl-10 transition-all"
              />
              <Link2 className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-purple-600/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando & Adicionando...
                </>
              ) : (
                <>
                  <Music className="w-4 h-4" />
                  Adicionar à Playlist 24/7
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
              {error}
            </div>
          )}
        </section>

        {/* Lista de Músicas na Playlist */}
        <section className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-purple-400" />
              Músicas na Fila
            </h2>
            <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-mono">
              {playlist.length} faixas
            </span>
          </div>

          {fetchingPlaylist ? (
            <div className="flex items-center justify-center py-8 text-slate-500 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando playlist...
            </div>
          ) : playlist.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
              Nenhuma música na fila. Adicione um link do YouTube acima!
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {playlist.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <span className="text-xs font-mono font-bold text-slate-600 w-5 text-center">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate group-hover:text-purple-300 transition-colors">
                        {song.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copyLink(song.id, song.url)}
                      title="Copiar link MP3"
                      className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
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
                      className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-all disabled:opacity-50"
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