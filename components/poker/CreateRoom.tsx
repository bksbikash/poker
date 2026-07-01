'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BLIND_OPTIONS, STARTING_CHIPS } from '@/lib/config';

/** Home screen: create a table and get a shareable link to invite guests. */
export function CreateRoom() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [blindIdx, setBlindIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    const blinds = BLIND_OPTIONS[blindIdx];
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: name, smallBlind: blinds.sb, bigBlind: blinds.bb }),
      });
      const data = (await res.json()) as { roomId?: string; token?: string; error?: string };
      if (!res.ok || !data.roomId || !data.token) {
        setError(data.error ?? 'Could not create the table');
        setCreating(false);
        return;
      }
      localStorage.setItem(`poker:${data.roomId}`, data.token);
      router.push(`/room/${data.roomId}`);
    } catch {
      setError('Network error — please try again');
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md rounded-2xl bg-slate-900/80 p-6 shadow-2xl ring-1 ring-white/10"
    >
      <h1 className="mb-1 text-center text-2xl font-black text-amber-300">Texas Hold&apos;em</h1>
      <p className="mb-5 text-center text-sm text-slate-400">
        Create a table, share the link, and play across devices — 2–10 guests.
      </p>

      <div className="mb-5 flex items-center justify-center gap-3 rounded-lg bg-slate-950/50 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/5">
        <Coin className="bg-green-500" /> 5×100
        <Coin className="bg-blue-500" /> 5×500
        <Coin className="bg-red-500" /> 5×1000
        <span className="font-mono text-amber-300">= {STARTING_CHIPS.toLocaleString()}</span>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Your name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={14}
            placeholder="Host"
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-400"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Blinds
          </span>
          <div className="grid grid-cols-3 gap-2">
            {BLIND_OPTIONS.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setBlindIdx(i)}
                className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
                  blindIdx === i
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {b.sb}/{b.bb}
              </button>
            ))}
          </div>
        </label>

        {error && <p className="text-center text-xs text-rose-400">{error}</p>}

        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="w-full rounded-xl bg-amber-500 py-3 text-lg font-black text-slate-900 shadow-lg transition hover:bg-amber-400 active:scale-95 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create Table'}
        </button>
      </div>
    </motion.div>
  );
}

function Coin({ className }: { className: string }) {
  return <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 ${className}`} />;
}
