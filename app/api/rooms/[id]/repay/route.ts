import { repayLoan } from '@/lib/server/roomManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/rooms/:id/repay — repay your dealer loan (needs 2× the loan). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await req.json()) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    repayLoan(id, token);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 },
    );
  }
}
