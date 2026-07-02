import { leaveRoom } from '@/lib/server/roomManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rooms/:id/leave — leave the table (auto-folds the current hand). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    if (token) leaveRoom(id, token);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 },
    );
  }
}
