# Texas Hold'em Poker — networked multiplayer

A production-ready Texas Hold'em game built with **Next.js 15 (App Router)**, **React 19**, **TypeScript (strict, zero `any`)**, **Tailwind CSS v4**, **Zustand**, and **Framer Motion**.

Create a table, **share the link**, and up to **10 guests play from their own devices**. The server is authoritative — all poker rules run server-side and each device only ever sees its own hole cards. The full official rules are implemented: blinds, betting, side pots, hand evaluation, showdown — with a custom coin economy, a dealer-loan system (no elimination), live standings, a 30-second turn clock, and automatic dealing.

## Highlights

- **Cross-device multiplayer via a share link** — one host creates a room, everyone else opens `/room/<code>` on their phone/laptop and takes a seat.
- **Server-authoritative & secure** — rules run only on the server; state is streamed to each client **redacted** so no one sees another player's hole cards, and the deck is never sent to the browser.
- **Live sync with Server-Sent Events** — every device gets an instant, always-current view; actions go over REST. No extra services or WebSocket server needed.
- **Complete, correct rules engine** — Fisher–Yates shuffle, no duplicate cards, dealer/blind rotation, pre-flop → flop → turn → river → showdown, exact main/side-pot accounting, split pots with the correct odd-chip rule.
- **Full hand evaluator** — all ten categories, ace-high and ace-low (wheel) straights, kickers and precise tie-breakers.
- **Illegal moves are impossible** — checking into a bet, sub-minimum raises, out-of-turn play, acting after folding and invalid amounts are all rejected by the engine.
- **30-second turn clock** — a player who doesn't act in time is **auto-folded**. Hands deal automatically after the showdown window (no manual "deal" button).
- **Watch, then sit in** — open the link to **spectate** (you see the board and chip counts but no one's hole cards), then take a seat whenever you like.
- **Leave / disconnect handling** — leaving the table (or dropping offline past a short grace period) **auto-folds** the current hand and sits the player out; reconnecting deals them back in on the next hand.
- **Realistic cards + polished UI** — proper pip layouts, court/ace faces, 3D flip & deal animations, colored coin stacks, a persistent chip-standings bar, crown/loser badges, and a winner overlay.

## House rules

- **Coins** — every player starts with **5×🟢100 + 5×🔵500 + 5×🔴1000 = 8,000** chips. Chips are always visible for every player during play.
- **No elimination — dealer loans** — when a player runs out, the dealer auto-loans **5,000** so they keep playing; the loan counts against them.
- **Repay a loan** — a player may repay their dealer loan in full once they hold **at least double** the loan in chips. The loan leaves the stack and the debt (and loser-badge risk) is cleared.
- **Standings** — **net worth = chips − loans**. The leader wears a 👑 **king crown**; the player most in the red wears an inverted "loser" crown. Both update live.
- **Full showdown reveal** — at showdown the whole table stays revealed for **15 seconds** with every shown hand face-up and a non-blocking winner banner (with a countdown) — not a pop-up that hides the table — before the next hand deals.
- **Join mid-match** — a guest who opens the link after the game has started (whether they were spectating or arriving fresh) takes a seat with a fresh 8,000-chip stack, sits out the hand in progress, and is dealt in automatically on the next deal.
- **Idle / absent = folded** — not acting within the 30-second clock, leaving the table, or disconnecting all fold you out of the current hand; leaving/disconnecting also sits you out until you return.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

1. Open the app and **Create Table** (choose your name and the blinds).
2. On the lobby screen, **copy the share link** and send it to your friends.
3. Each guest opens the link on their device and takes a seat.
4. The host clicks **Start Game** — play begins and syncs to everyone.

Production:

```bash
npm run build
npm start             # serves the production build (webpack build → `next start`)
```

Other scripts: `npm test` (Vitest), `npm run typecheck` (`tsc --noEmit`).

> The dev script uses Turbopack; the production `build` uses the webpack builder because `next start` requires its route manifest. Both run the same app.

## Architecture

Three layers: a **pure rules engine** (`lib/poker`), a **server-authoritative room manager** (`lib/server` + `app/api`), and a **client** (`store` + `components`) that renders redacted state and submits actions.

```
lib/
  config.ts               Shared constants (coins, loan, 30s clock, blind presets)
  roomTypes.ts            RoomSnapshot / lobby types shared by server & client
  poker/                  PURE engine — no I/O, no DOM
    types.ts              Domain types (strict; no `any`)
    deck.ts, shuffle.ts   52-card deck, Fisher–Yates + seedable RNG, dup guard
    handEvaluator.ts      Best-5-of-7 evaluation, comparison, tie-breakers
    sidePotManager.ts     Side pots + uncalled-bet returns
    winnerEvaluator.ts    Showdown resolution, split pots, odd-chip rule
    betting.ts            Legal actions, validation, chip accounting
    turnManager.ts        Turn order + betting-round completion
    dealer.ts             Button/blinds/dealing (incl. heads-up)
    gameEngine.ts         Pure state machine + loans + standings
    aiEngine.ts           (Test-only) decision making used to fuzz the engine
  server/
    roomManager.ts        In-memory rooms, authoritative timers, per-viewer redaction

app/api/rooms/…           create · join · start · action · stream (SSE)
store/roomStore.ts        Client: EventSource subscription + REST actions
components/poker/         CreateRoom, RoomView, PokerTable, PlayerSeat, PlayingCard,
                          CommunityCards, Pot, BettingControls, DealerButton,
                          ChipStack, WinnerModal
app/page.tsx              Create-a-table home
app/room/[id]/page.tsx    Join → lobby (share link) → table
```

### Flow

```
Host: POST /api/rooms ─▶ { roomId, token }         (host seated as p0)
Guests: open /room/<id> ─▶ POST /api/rooms/:id/join ─▶ { token }
All: GET /api/rooms/:id/stream?token=…  (SSE)  ◀── redacted RoomSnapshot on every change
Host: POST /api/rooms/:id/start
Turn: POST /api/rooms/:id/action { token, action }
        │
        ▼
   roomManager: engine.act(state, seatId, action)   ← validated; wrong seat/turn rejected
        │  new GameState
        ▼
   broadcast → each subscriber gets a snapshot redacted for THEIR seat
        (own hole cards visible; opponents hidden; deck removed)
```

The server owns the 30-second turn timer and the inter-hand deal timer, so timing is consistent for everyone and a disconnected client can't stall the table.

## Correctness & tests

Vitest suite (`npm test`, 50 tests):

- deck integrity + shuffle properties (no dupes, multiset preserved, deterministic with a seed);
- every hand category, the wheel straight, kicker battles, exact ties;
- side-pot construction, uncalled-bet refunds, side-pot awarding, split pots + odd chip;
- legal/illegal action enforcement + minimum raise;
- loan-on-bust and standings (leader/loser);
- a **40-hand fuzz test** asserting no illegal action is ever produced and chips are conserved to the last unit;
- **room-manager integration tests**: rostering, host-only start, redaction (opponents' cards and the deck are never exposed), out-of-turn rejection, the 30s auto-fold, and automatic next-hand dealing.

## Notes & scaling

- **Rooms are in-memory** on a single server process (kept on `globalThis` to survive dev HMR). Perfect for local play or a single self-hosted instance. For horizontally-scaled / serverless deployment, back the room manager with Redis (or similar) and use a pub/sub fan-out instead of the in-process subscriber map — the engine and redaction logic stay unchanged.
- **Transport** is SSE (server→client) + REST (client→server), which needs no custom server. Swapping in WebSockets/Socket.IO later is a transport-only change; `gameEngine.act` remains the single authority.

## Deployment

This is a **stateful, long-running Next.js server**: rooms live in memory and every client holds an open SSE connection (see *Notes & scaling*). Host it accordingly.

**Recommended — one persistent Node instance** (Render, Railway, Fly.io, or any VPS):

```bash
npm install
npm run build
npm start            # serves the production build on $PORT — keep one always-on instance
```

Configure the host with build command `npm run build` and start command `npm start`. A single instance handles a single table fine; because room state is in-process, do **not** run multiple replicas without the shared-store refactor below.

**Vercel / serverless — needs one change first.** On Vercel each request can land on a different, short-lived function instance, so the in-memory room map isn't shared between players and long-lived SSE streams are time-capped. The repo builds and deploys, but rooms won't sync reliably. To run it on Vercel, first back `lib/server/roomManager.ts` with a shared store (e.g. Redis / Upstash) plus a pub/sub fan-out for the SSE broadcast — the pure engine and per-seat redaction stay unchanged. Then import the GitHub repo at [vercel.com/new](https://vercel.com/new) and it auto-deploys on every push to `main`.
