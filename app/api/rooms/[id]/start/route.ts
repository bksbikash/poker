import { startRoom } from '@/lib/server/roomManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rooms/:id/start — host deals the first hand. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await req.json()) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    startRoom(id, token);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 },
    );
  }
}
