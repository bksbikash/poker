import { submitAction } from '@/lib/server/roomManager';
import type { ActionType, PlayerAction } from '@/lib/poker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'fold',
  'check',
  'call',
  'bet',
  'raise',
  'allIn',
]);

/** POST /api/rooms/:id/action — submit an action for your seat, on your turn. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await req.json()) as { token?: unknown; action?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';

    const action = parseAction(body.action);
    submitAction(id, token, action);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 },
    );
  }
}

function parseAction(raw: unknown): PlayerAction {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid action');
  const candidate = raw as { type?: unknown; amount?: unknown };
  if (typeof candidate.type !== 'string' || !ACTION_TYPES.has(candidate.type as ActionType)) {
    throw new Error('Invalid action type');
  }
  const action: PlayerAction = { type: candidate.type as ActionType };
  if (candidate.amount !== undefined) {
    const amount = Number(candidate.amount);
    if (!Number.isFinite(amount)) throw new Error('Invalid amount');
    return { type: action.type, amount };
  }
  return action;
}
