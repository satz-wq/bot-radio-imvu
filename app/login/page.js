'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Lock, Mail, Loader2, Sparkles } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg('E-mail ou senha incorretos.');
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center p-4 selection:bg-purple-600 selection:text-white relative overflow-hidden">
      {/* Luzes de fundo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-950/90 border border-purple-900/50 p-8 rounded-3xl shadow-[0_0_40px_rgba(168,85,247,0.2)] backdrop-blur-2xl relative z-10 space-y-6">
        
        {/* Cabeçalho do Card */}
        <div className="text-center space-y-3">
          <img
            src="/logo-drama.png"
            alt="Drama Logo"
            className="h-16 w-auto mx-auto object-contain drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]"
          />
          <div className="flex items-center justify-center gap-1.5 text-xs text-purple-300 font-mono tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" />
            <span>Acesso Restrito ao Painel</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-purple-300/80 font-mono uppercase tracking-wider">E-mail Administrador</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu-email@exemplo.com"
                className="w-full bg-black/80 border border-purple-900/50 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 pl-10 transition-all"
              />
              <Mail className="w-4 h-4 text-purple-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-purple-300/80 font-mono uppercase tracking-wider">Senha</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-black/80 border border-purple-900/50 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500 pl-10 transition-all"
              />
              <Lock className="w-4 h-4 text-purple-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-800 via-fuchsia-700 to-purple-800 hover:from-purple-700 hover:to-fuchsia-600 text-white font-bold tracking-wider uppercase text-xs py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_0_20px_rgba(168,85,247,0.4)] border border-purple-500/30 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                Autenticando...
              </>
            ) : (
              'Entrar no Painel'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}