'use client';

import { useEffect, useState } from 'react';
import type { LegalActions, PlayerAction } from '@/lib/poker';
import { TURN_SECONDS } from '@/lib/config';

interface BettingControlsProps {
  /** Legal actions for the current player, or null when between hands. */
  legal: LegalActions | null;
  /** Name of the player whose turn it is. */
  playerName: string | null;
  pot: number;
  currentBet: number;
  onAction: (action: PlayerAction) => void;
  message?: string | null;
  /** Shown when it is not this device's turn to act. */
  waitingText?: string;
  /** Epoch ms when the turn auto-resolves (for the countdown). */
  turnEndsAt: number | null;
}

const STEP = 100; // coin-friendly increments

/** Current player's action bar with a 30-second turn clock. */
export function BettingControls({
  legal,
  playerName,
  pot,
  currentBet,
  onAction,
  message,
  waitingText,
  turnEndsAt,
}: BettingControlsProps) {
  const canSize = !!legal && (legal.canBet || legal.canRaise) && legal.maxRaiseTo > legal.minRaiseTo;
  const [raiseTo, setRaiseTo] = useState(legal?.minRaiseTo ?? 0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!legal) return;
    setRaiseTo((prev) => clamp(prev || legal.minRaiseTo, legal.minRaiseTo, legal.maxRaiseTo));
  }, [legal]);

  // Tick the countdown while it is someone's turn.
  useEffect(() => {
    if (!turnEndsAt) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [turnEndsAt]);

  if (!legal) {
    return (
      <div className="flex h-[5.5rem] items-center justify-center rounded-xl bg-slate-900/70 px-4 text-center text-sm text-slate-400 ring-1 ring-white/10">
        {waitingText ?? 'Next hand dealing…'}
      </div>
    );
  }

  const secondsLeft = turnEndsAt ? Math.max(0, Math.ceil((turnEndsAt - now) / 1000)) : TURN_SECONDS;
  const fraction = clamp(secondsLeft / TURN_SECONDS, 0, 1);
  const urgent = secondsLeft <= 10;

  const isBet = legal.canBet && currentBet === 0;
  const preset = (target: number) =>
    setRaiseTo(clamp(Math.round(target / STEP) * STEP, legal.minRaiseTo, legal.maxRaiseTo));

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-slate-900/80 p-3 ring-1 ring-white/10 backdrop-blur">
      {/* Turn banner + countdown */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-amber-200">
          {playerName ? `${playerName}'s turn` : 'Your turn'}
        </span>
        <span className={`font-mono tabular-nums ${urgent ? 'text-rose-400' : 'text-slate-300'}`}>
          {secondsLeft}s
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            urgent ? 'bg-rose-500' : 'bg-amber-400'
          }`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      {message && <p className="text-center text-xs text-rose-300">{message}</p>}

      {canSize && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            step={STEP}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-400"
            aria-label="Raise amount"
          />
          <span className="w-20 text-right font-mono text-sm tabular-nums text-amber-200">
            {raiseTo.toLocaleString()}
          </span>
          <div className="flex gap-1">
            <PresetButton onClick={() => preset(currentBet + pot / 2)}>½</PresetButton>
            <PresetButton onClick={() => preset(currentBet + pot)}>Pot</PresetButton>
            <PresetButton onClick={() => preset(legal.maxRaiseTo)}>Max</PresetButton>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          disabled={!legal.canFold}
          onClick={() => onAction({ type: 'fold' })}
          className="bg-rose-700 hover:bg-rose-600"
        >
          Fold
        </ActionButton>

        {legal.canCheck ? (
          <ActionButton
            onClick={() => onAction({ type: 'check' })}
            className="bg-emerald-700 hover:bg-emerald-600"
          >
            Check
          </ActionButton>
        ) : (
          <ActionButton
            disabled={!legal.canCall}
            onClick={() => onAction({ type: 'call' })}
            className="bg-emerald-700 hover:bg-emerald-600"
          >
            Call {legal.callAmount.toLocaleString()}
          </ActionButton>
        )}

        {canSize ? (
          <ActionButton
            onClick={() => onAction({ type: isBet ? 'bet' : 'raise', amount: raiseTo })}
            className="bg-amber-600 hover:bg-amber-500"
          >
            {isBet ? 'Bet' : 'Raise to'} {raiseTo.toLocaleString()}
          </ActionButton>
        ) : (
          <ActionButton
            disabled={!legal.canAllIn}
            onClick={() => onAction({ type: 'allIn' })}
            className="bg-fuchsia-700 hover:bg-fuchsia-600"
          >
            All-In
          </ActionButton>
        )}
      </div>

      {canSize && legal.canAllIn && (
        <ActionButton
          onClick={() => onAction({ type: 'allIn' })}
          className="bg-fuchsia-700 py-1.5 text-xs hover:bg-fuchsia-600"
        >
          All-In ({legal.maxRaiseTo.toLocaleString()})
        </ActionButton>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2.5 text-sm font-bold text-white shadow transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded bg-slate-700 px-2 py-1 text-[0.65rem] font-semibold text-slate-200 hover:bg-slate-600"
    >
      {children}
    </button>
  );
}
