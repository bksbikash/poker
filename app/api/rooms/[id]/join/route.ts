import { joinRoom } from '@/lib/server/roomManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rooms/:id/join — take an open seat as a guest. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await req.json()) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name : '';
    const result = joinRoom(id, name);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 },
    );
  }
}
