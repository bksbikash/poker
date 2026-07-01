import { createRoom } from '@/lib/server/roomManager';
import { BLIND_OPTIONS } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateBody {
  hostName?: unknown;
  smallBlind?: unknown;
  bigBlind?: unknown;
}

/** POST /api/rooms — create a new table and seat the host. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as CreateBody;
    const hostName = typeof body.hostName === 'string' ? body.hostName : 'Player 1';

    // Only accept coin-friendly blind presets to keep chip math clean.
    const sb = Number(body.smallBlind);
    const bb = Number(body.bigBlind);
    const valid = BLIND_OPTIONS.some((o) => o.sb === sb && o.bb === bb);
    const blinds = valid ? { sb, bb } : BLIND_OPTIONS[0];

    const result = createRoom({ hostName, smallBlind: blinds.sb, bigBlind: blinds.bb });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: messageOf(error) }, { status: 400 });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}
