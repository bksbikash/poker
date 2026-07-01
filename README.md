# Texas Hold'em Poker

A production-ready, single-table Texas Hold'em game built with **Next.js 15 (App Router)**, **React 19**, **TypeScript (strict, zero `any`)**, **Tailwind CSS v4**, **Zustand**, and **Framer Motion**. It is **local hot-seat multiplayer** for **2–10 guests** (no AI), implementing the official rules end to end — blinds, betting, side pots, full hand evaluation, showdown — with a custom coin economy and standings.

## Highlights

- **Local multiplayer, no AI** — 2–10 human guests share one device and pass it on each turn.
- **Complete, correct rules engine** — Fisher–Yates shuffle, no duplicate cards, dealer/blind rotation, pre-flop → flop → turn → river → showdown.
- **Exact chip accounting** — main pot, multiple side pots, uncalled-bet returns, split pots with correct odd-chip distribution.
- **Full hand evaluator** — all ten categories, ace-high and ace-low (wheel) straights, kickers and precise tie-breakers.
- **Legal-action enforcement** — illegal moves (checking into a bet, sub-minimum raises, acting out of turn, acting after folding, invalid amounts) are impossible to make.
- **30-second turn clock** — every player has 30s to act; on timeout they auto-check, or auto-fold when facing a bet. No manual "deal" button — the next hand deals automatically after a short showdown pause.
- **Realistic cards** — proper pip layouts for number cards, court/ace faces, 3D flip + deal animations.
- **Polished UI** — responsive felt table, seated players, dealer button, colored coin stacks, turn highlight + countdown, winner overlay.
- **Pure engine, separated from UI** — the entire rules layer is side-effect-free `(state, action) => state`, which makes it directly reusable for authoritative server-side (networked) multiplayer.

## House rules

- **Coins** — every player starts with **5×🟢100 + 5×🔵500 + 5×🔴1000 = 8,000** chips.
- **No elimination — dealer loans** — when a player runs out of chips, the dealer auto-loans them **5,000** more so they can keep playing. The loan counts against them.
- **Standings** — **net worth = chips − loans**. The leader wears a 👑 **king crown**; the player most in the red wears an inverted "loser" crown. Badges update live as the game goes on.

> An `aiEngine` module ships with the project and is used **only** as a fuzz-test harness to validate the rules engine — it is not part of gameplay.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm start          # serve the production build
npm test           # run the engine + store test suite (Vitest)
npm run typecheck  # tsc --noEmit
```

## Architecture

The codebase is split into a **pure logic layer** (`lib/poker`), a **state/orchestration layer** (`store`), and a **presentation layer** (`components`). UI never contains poker rules; logic never touches the DOM.

```
lib/poker/
  types.ts            All domain types (strict; no `any`)
  deck.ts             52-card deck, card labels, duplicate guard
  shuffle.ts          Fisher–Yates shuffle + seedable RNG (deterministic tests)
  handEvaluator.ts    Best-5-of-7 evaluation, comparison, tie-breakers
  sidePotManager.ts   Side-pot construction + uncalled-bet returns
  winnerEvaluator.ts  Showdown resolution, split pots, odd-chip rule
  betting.ts          Legal actions, validation, chip commitment, raise rules
  turnManager.ts      Turn order, betting-round completion
  dealer.ts           Button rotation, blind assignment, dealing (incl. heads-up)
  gameEngine.ts       Pure state machine: createGame / startHand / act; loans + standings
  aiEngine.ts         (Test-only) decision making used to fuzz the engine
  index.ts            Public barrel

store/
  gameStore.ts        Zustand store; 30s turn clock + automatic dealing (local multiplayer)

components/poker/
  PokerTable, PlayerSeat, PlayingCard, CommunityCards, Pot,
  BettingControls, DealerButton, ChipStack, WinnerModal, Lobby
```

### Data flow

```
UI event ─▶ store.playerAction(action)   // applies to the current player
                 │
                 ▼
        gameEngine.act(state, id, action)   ← pure, validated, immutable
                 │  returns new GameState
                 ▼
        store.set({ game })  ─▶ scheduleNext()
                 │
                 ├─ player's turn? → start 30s clock; on timeout auto check/fold
                 └─ showdown?      → setTimeout(startHand)  (auto-deal next hand)
```

Because `act` is a pure, validating reducer, every input (manual or timeout) shares the exact same code path, and the store can never push the game into an illegal state.

## Correctness & tests

The rules engine is covered by a Vitest suite (`tests/`) including:

- deck integrity and shuffle properties (no dupes, multiset preserved, deterministic with a seed);
- every hand category, the wheel straight, kicker battles and exact ties;
- side-pot construction, uncalled-bet refunds, side-pot awarding, split pots and the odd-chip rule;
- legal-action / illegal-action enforcement and minimum-raise rules;
- a **40-hand AI fuzz test** asserting no illegal action is ever produced and **chips are conserved to the last unit**;
- store-level integration tests (fake timers) that drive a full hand with AI auto-acting and confirm the next hand auto-deals.

```bash
npm test
```

## Ready for multiplayer

The engine is intentionally transport-agnostic and authoritative-server friendly:

- **Pure reducers** — `act(state, playerId, action)` returns a brand-new `GameState`. Run it on a Node/WebSocket server and broadcast the resulting state (or a per-seat redacted view that hides other players' hole cards).
- **Server-side validation** — `getLegalActions` and the `IllegalActionError` thrown by `applyBettingAction` are the single source of truth, so a malicious client cannot force an illegal move.
- **Deterministic shuffles** — `shuffle`/`shuffleDeck` accept an injectable RNG, enabling provably-fair seeds or a server CSPRNG.
- **Serializable state** — `GameState` is plain data (no class instances), so it travels cleanly over Socket.IO/WebSocket and is trivial to persist.

To go from local hot-seat to **networked** multiplayer, replace the timer/dispatch glue in `store/gameStore.ts` with a socket transport: send `PlayerAction`s to the server, run `act` there, and stream per-seat `GameState` snapshots back to each client.

## Tech notes

- **Strict typing** — `tsconfig` runs in `strict` mode and the project contains no `any`.
- **Tailwind v4** via `@tailwindcss/postcss`.
- **Framer Motion** powers card dealing/flipping, chip stacks, turn pulses and the winner modal.
