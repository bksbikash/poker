'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRoomStore } from '@/store/roomStore';
import { MIN_PLAYERS, MAX_PLAYERS, TURN_SECONDS } from '@/lib/config';
import { PokerTable } from './PokerTable';

type Intent = 'loading' | 'choose' | 'join' | 'watch' | 'play';

/** /room/[id]: choose (watch or sit) → join → lobby (share link) → table. */
export function RoomView({ roomId }: { roomId: string }) {
  const router = useRouter();
  const snapshot = useRoomStore((s) => s.snapshot);
  const status = useRoomStore((s) => s.status);
  const error = useRoomStore((s) => s.error);
  const connect = useRoomStore((s) => s.connect);
  const disconnect = useRoomStore((s) => s.disconnect);
  const act = useRoomStore((s) => s.act);
  const repay = useRoomStore((s) => s.repay);
  const start = useRoomStore((s) => s.start);
  const storeLeave = useRoomStore((s) => s.leave);

  const [intent, setIntent] = useState<Intent>('loading');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShareUrl(`${window.location.origin}/room/${roomId}`);
    const stored = localStorage.getItem(`poker:${roomId}`);
    if (stored) {
      setIntent('play');
      connect(roomId, stored);
    } else {
      setIntent('choose');
    }
  }, [roomId, connect]);

  useEffect(() => () => disconnect(), [disconnect]);

  const watch = useCallback(() => {
    setIntent('watch');
    connect(roomId, ''); // tokenless spectator stream
  }, [roomId, connect]);

  const doJoin = useCallback(async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setJoinError(data.error ?? 'Could not join the table');
        setJoining(false);
        return;
      }
      localStorage.setItem(`poker:${roomId}`, data.token);
      setIntent('play');
      connect(roomId, data.token);
    } catch {
      setJoinError('Network error — please try again');
    }
    setJoining(false);
  }, [roomId, name, connect]);

  const leave = useCallback(() => {
    if (snapshot?.you) storeLeave();
    else disconnect();
    localStorage.removeItem(`poker:${roomId}`);
    router.push('/');
  }, [roomId, snapshot?.you, storeLeave, disconnect, router]);

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [shareUrl]);

  if (intent === 'loading') return <Centered>Loading…</Centered>;

  if (intent === 'choose') {
    return (
      <Panel>
        <h1 className="mb-1 text-center text-xl font-black text-amber-300">Join Table</h1>
        <p className="mb-5 text-center text-sm text-slate-400">
          Room <span className="font-mono text-amber-300">{roomId}</span>
        </p>
        <button
          type="button"
          onClick={() => setIntent('join')}
          className="mb-2 w-full rounded-xl bg-amber-500 py-2.5 font-bold text-slate-900 transition hover:bg-amber-400 active:scale-95"
        >
          Take a seat
        </button>
        <button
          type="button"
          onClick={watch}
          className="w-full rounded-xl bg-slate-700 py-2.5 font-semibold text-slate-100 transition hover:bg-slate-600 active:scale-95"
        >
          Watch the game
        </button>
        <p className="mt-3 text-center text-[0.7rem] text-slate-500">
          Watch first, then sit in whenever you like — you&apos;ll be dealt in on the next hand.
        </p>
      </Panel>
    );
  }

  if (intent === 'join') {
    return (
      <Panel>
        <h1 className="mb-1 text-center text-xl font-black text-amber-300">Take a seat</h1>
        <p className="mb-4 text-center text-sm text-slate-400">
          Room <span className="font-mono text-amber-300">{roomId}</span>
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={14}
          placeholder="Your name"
          className="mb-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-amber-400"
        />
        {joinError && <p className="mb-3 text-center text-xs text-rose-400">{joinError}</p>}
        <button
          type="button"
          onClick={doJoin}
          disabled={joining}
          className="w-full rounded-xl bg-amber-500 py-2.5 font-bold text-slate-900 transition hover:bg-amber-400 active:scale-95 disabled:opacity-50"
        >
          {joining ? 'Joining…' : 'Sit down'}
        </button>
        <button
          type="button"
          onClick={() => setIntent('choose')}
          className="mt-2 w-full rounded-lg bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          Back
        </button>
      </Panel>
    );
  }

  // intent === 'watch' | 'play' → connected.
  if (!snapshot) {
    return (
      <Centered>
        {status === 'error' ? 'Unable to reach the room. It may have ended.' : 'Connecting…'}
      </Centered>
    );
  }

  const spectating = snapshot.you === null;

  // Pre-game lobby.
  if (!snapshot.started) {
    const canStart = snapshot.isHost && snapshot.players.length >= MIN_PLAYERS;
    return (
      <Panel>
        <h1 className="mb-1 text-center text-xl font-black text-amber-300">Table Lobby</h1>
        <p className="mb-4 text-center text-sm text-slate-400">
          Room <span className="font-mono text-amber-300">{roomId}</span> · blinds{' '}
          <span className="font-mono text-amber-300">
            {snapshot.smallBlind}/{snapshot.bigBlind}
          </span>
        </p>

        <div className="mb-4">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Share this link to invite players
          </span>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="w-full rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Seated ({snapshot.players.length}/{MAX_PLAYERS})
        </span>
        <ul className="mb-4 space-y-1">
          {snapshot.players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-1.5 text-sm ring-1 ring-white/5"
            >
              <span className="text-slate-200">
                {p.name}
                {p.id === snapshot.you && <span className="ml-1 text-xs text-sky-300">(you)</span>}
              </span>
              {p.id === snapshot.hostId && <span className="text-xs text-amber-300">host</span>}
            </li>
          ))}
        </ul>

        {error && <p className="mb-2 text-center text-xs text-rose-400">{error}</p>}

        {spectating ? (
          <button
            type="button"
            onClick={() => setIntent('join')}
            className="w-full rounded-xl bg-amber-500 py-2.5 font-bold text-slate-900 transition hover:bg-amber-400 active:scale-95"
          >
            Take a seat
          </button>
        ) : snapshot.isHost ? (
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className="w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-40"
          >
            {canStart ? 'Start Game' : `Waiting for players (need ${MIN_PLAYERS}+)`}
          </button>
        ) : (
          <p className="text-center text-sm text-slate-400">Waiting for the host to start…</p>
        )}

        <button
          type="button"
          onClick={leave}
          className="mt-3 w-full rounded-lg bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          Leave
        </button>

        <p className="mt-3 text-center text-[0.7rem] text-slate-500">
          {TURN_SECONDS}s per turn · idle players auto-fold · hands deal automatically
        </p>
      </Panel>
    );
  }

  if (!snapshot.game) return <Centered>Dealing…</Centered>;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {spectating && (
        <div className="flex w-full max-w-3xl items-center justify-between rounded-lg bg-indigo-950/60 px-4 py-2 text-xs text-indigo-200 ring-1 ring-indigo-500/30">
          <span>👀 You&apos;re watching this table.</span>
          <button
            type="button"
            onClick={() => setIntent('join')}
            className="rounded-md bg-amber-500 px-3 py-1 font-bold text-slate-900 hover:bg-amber-400"
          >
            Sit in
          </button>
        </div>
      )}
      <PokerTable
        game={snapshot.game}
        youId={snapshot.you}
        turnEndsAt={snapshot.turnEndsAt}
        nextHandAt={snapshot.nextHandAt}
        error={error}
        onAction={act}
        onRepay={repay}
        onLeave={leave}
      />
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md rounded-2xl bg-slate-900/80 p-6 shadow-2xl ring-1 ring-white/10"
    >
      {children}
    </motion.div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-900/70 px-6 py-4 text-slate-300 ring-1 ring-white/10">
      {children}
    </div>
  );
}
