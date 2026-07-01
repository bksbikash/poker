'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  cardId,
  displayPot,
  getLegalActions,
  netWorth,
  standings,
  type GameState,
  type Player,
  type PlayerAction,
} from '@/lib/poker';
import { PlayerSeat } from './PlayerSeat';
import { CommunityCards } from './CommunityCards';
import { Pot } from './Pot';
import { DealerButton } from './DealerButton';
import { BettingControls } from './BettingControls';
import { WinnerModal } from './WinnerModal';

interface PokerTableProps {
  game: GameState;
  /** The local device's player id. */
  youId: string | null;
  turnEndsAt: number | null;
  error?: string | null;
  onAction: (action: PlayerAction) => void;
  onLeave: () => void;
}

function seatLayout(displayIndex: number, total: number): { left: number; top: number } {
  const theta = Math.PI / 2 + (displayIndex / total) * Math.PI * 2;
  return { left: 50 + 44 * Math.cos(theta), top: 50 + 40 * Math.sin(theta) };
}

interface ShowdownInfo {
  winnerIds: Set<string>;
  handNames: Map<string, string>;
  highlightedIds: Set<string>;
}

function deriveShowdown(game: GameState): ShowdownInfo {
  const winnerIds = new Set<string>();
  const handNames = new Map<string, string>();
  const highlightedIds = new Set<string>();
  if (game.phase === 'showdown') {
    for (const award of game.awards) {
      for (const w of award.winners) {
        winnerIds.add(w.playerId);
        if (w.hand) {
          handNames.set(w.playerId, w.hand.name);
          for (const card of w.hand.cards) highlightedIds.add(cardId(card));
        }
      }
    }
  }
  return { winnerIds, handNames, highlightedIds };
}

/** The full poker table, driven entirely by a (redacted) server snapshot. */
export function PokerTable({ game, youId, turnEndsAt, error, onAction, onLeave }: PokerTableProps) {
  const showdown = useMemo(() => deriveShowdown(game), [game]);
  const ranks = useMemo(() => standings(game), [game]);

  const bettable =
    game.phase === 'preflop' ||
    game.phase === 'flop' ||
    game.phase === 'turn' ||
    game.phase === 'river';

  const currentPlayer = game.currentPlayerIndex >= 0 ? game.players[game.currentPlayerIndex] : null;
  const isYourTurn = bettable && !!currentPlayer && currentPlayer.id === youId;
  const legal = useMemo(
    () => (isYourTurn && youId ? getLegalActions(game, youId) : null),
    [isYourTurn, youId, game],
  );

  const n = game.players.length;
  const pot = displayPot(game);
  // Orient the table so this device's own seat sits at the bottom-centre.
  const youSeat = game.players.find((p) => p.id === youId)?.seatIndex ?? 0;
  const displayIndexOf = (player: Player): number => (player.seatIndex - youSeat + n) % n;

  const waitingText =
    game.phase === 'showdown'
      ? 'Next hand dealing…'
      : currentPlayer
        ? `Waiting for ${currentPlayer.name}…`
        : 'Waiting…';

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* Status bar */}
      <div className="flex w-full max-w-3xl items-center justify-between rounded-lg bg-slate-900/70 px-4 py-2 text-xs text-slate-300 ring-1 ring-white/10">
        <span>
          Hand <span className="font-mono text-amber-300">#{game.handNumber}</span>
        </span>
        <span className="capitalize text-amber-200">{game.phase}</span>
        <span>
          Blinds{' '}
          <span className="font-mono text-amber-300">
            {game.smallBlindAmount}/{game.bigBlindAmount}
          </span>
        </span>
        <button
          type="button"
          onClick={onLeave}
          className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-200 hover:bg-slate-600"
        >
          Leave
        </button>
      </div>

      {/* Persistent chip standings — always visible while playing */}
      <div className="flex w-full max-w-3xl flex-wrap gap-1.5">
        {[...game.players]
          .sort((a, b) => netWorth(b) - netWorth(a))
          .map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ring-1 ${
                p.id === youId ? 'bg-sky-950/60 ring-sky-500/40' : 'bg-slate-900/60 ring-white/10'
              }`}
            >
              {ranks.leaderId === p.id && <span title="Leader">👑</span>}
              {ranks.loserId === p.id && ranks.leaderId !== p.id && (
                <span style={{ transform: 'rotate(180deg)', filter: 'grayscale(1) sepia(1) hue-rotate(-40deg)' }}>
                  👑
                </span>
              )}
              <span className="max-w-[5rem] truncate text-slate-200">{p.name}</span>
              <span className="font-mono text-amber-300">{p.chips.toLocaleString()}</span>
              {p.loan > 0 && <span className="font-mono text-rose-400">−{p.loan.toLocaleString()}</span>}
            </div>
          ))}
      </div>

      {/* Table */}
      <div className="relative aspect-[16/11] w-full max-w-3xl">
        <div className="absolute inset-[4%] rounded-[48%] border-[6px] border-amber-900/60 bg-gradient-to-b from-emerald-700 to-emerald-900 shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]">
          <div className="absolute inset-3 rounded-[48%] border border-emerald-400/15" />
        </div>

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <Pot total={pot} pots={game.pots} />
          <CommunityCards cards={game.communityCards} highlightedIds={showdown.highlightedIds} />
        </div>

        {game.dealerIndex >= 0 &&
          (() => {
            const dealer = game.players[game.dealerIndex];
            const layout = seatLayout(displayIndexOf(dealer), n);
            const left = 50 + (layout.left - 50) * 0.74;
            const top = 50 + (layout.top - 50) * 0.74;
            return (
              <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
                <DealerButton />
              </div>
            );
          })()}

        {game.players.map((player) => {
          const layout = seatLayout(displayIndexOf(player), n);
          const isCurrent = currentPlayer?.id === player.id && game.phase !== 'showdown';
          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${layout.left}%`, top: `${layout.top}%` }}
            >
              <PlayerSeat
                player={player}
                isCurrent={isCurrent}
                isYou={player.id === youId}
                isWinner={showdown.winnerIds.has(player.id)}
                winningHandName={showdown.handNames.get(player.id)}
                highlightedIds={showdown.highlightedIds}
                isLeader={ranks.leaderId === player.id}
                isLoser={ranks.loserId === player.id}
              />
            </div>
          );
        })}

        <WinnerModal visible={game.phase === 'showdown'} awards={game.awards} players={game.players} />
      </div>

      {/* Action log + controls */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
        <ActionLog game={game} />
        <BettingControls
          legal={legal}
          playerName={currentPlayer?.name ?? null}
          pot={pot}
          currentBet={game.currentBet}
          onAction={onAction}
          message={error}
          waitingText={waitingText}
          turnEndsAt={turnEndsAt}
        />
      </div>
    </div>
  );
}

function ActionLog({ game }: { game: GameState }) {
  const recent = game.log.slice(-6).reverse();
  return (
    <div className="flex max-h-[8rem] flex-col gap-1 overflow-hidden rounded-xl bg-slate-900/70 p-3 text-xs ring-1 ring-white/10">
      <span className="mb-1 text-[0.65rem] uppercase tracking-wider text-slate-500">Action log</span>
      <AnimatePresence initial={false}>
        {recent.map((entry, index) => (
          <motion.span
            key={`${game.handNumber}-${game.log.length - index}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: index === 0 ? 1 : 0.6, x: 0 }}
            className="truncate text-slate-300"
          >
            {entry.message}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
