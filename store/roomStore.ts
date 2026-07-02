import { create } from 'zustand';
import type { PlayerAction } from '@/lib/poker';
import type { RoomSnapshot } from '@/lib/roomTypes';

/**
 * Client store for a networked room. It subscribes to the server's SSE stream
 * (authoritative, redacted state) and submits actions over REST. It holds no
 * game rules — the server owns them.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'error';

export interface RoomStore {
  snapshot: RoomSnapshot | null;
  status: ConnectionStatus;
  error: string | null;
  roomId: string | null;
  token: string | null;

  connect: (roomId: string, token: string) => void;
  disconnect: () => void;
  start: () => Promise<void>;
  act: (action: PlayerAction) => Promise<void>;
  repay: () => Promise<void>;
  /** Leave the table (server auto-folds the current hand), then disconnect. */
  leave: () => Promise<void>;
  clearError: () => void;
}

let source: EventSource | null = null;

function closeSource(): void {
  if (source) {
    source.close();
    source = null;
  }
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  snapshot: null,
  status: 'idle',
  error: null,
  roomId: null,
  token: null,

  connect: (roomId: string, token: string) => {
    closeSource();
    set({ roomId, token, status: 'connecting', error: null, snapshot: null });

    const es = new EventSource(`/api/rooms/${roomId}/stream?token=${encodeURIComponent(token)}`);
    source = es;

    es.onopen = () => set({ status: 'open' });
    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as RoomSnapshot;
        set({ snapshot, status: 'open' });
      } catch {
        // ignore malformed frames (e.g. heartbeats are comments, not data)
      }
    };
    es.onerror = () => {
      // EventSource retries automatically; surface a soft error meanwhile.
      set({ status: 'error' });
    };
  },

  disconnect: () => {
    closeSource();
    set({ status: 'idle', snapshot: null, roomId: null, token: null });
  },

  start: async () => {
    const { roomId, token } = get();
    if (!roomId || !token) return;
    const res = await fetch(`/api/rooms/${roomId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      set({ error: data.error ?? 'Could not start the game' });
    }
  },

  act: async (action: PlayerAction) => {
    const { roomId, token } = get();
    if (!roomId || !token) return;
    const res = await fetch(`/api/rooms/${roomId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      set({ error: data.error ?? 'Action rejected' });
    } else {
      set({ error: null });
    }
  },

  repay: async () => {
    const { roomId, token } = get();
    if (!roomId || !token) return;
    const res = await fetch(`/api/rooms/${roomId}/repay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      set({ error: data.error ?? 'Could not repay loan' });
    } else {
      set({ error: null });
    }
  },

  leave: async () => {
    const { roomId, token } = get();
    if (roomId && token) {
      // Fire-and-forget; the disconnect grace would also cover this.
      await fetch(`/api/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => undefined);
    }
    closeSource();
    set({ status: 'idle', snapshot: null, roomId: null, token: null });
  },

  clearError: () => set({ error: null }),
}));
