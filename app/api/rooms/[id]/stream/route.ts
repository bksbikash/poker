import { subscribe, roomExists } from '@/lib/server/roomManager';
import type { RoomSnapshot } from '@/lib/roomTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/rooms/:id/stream?token=… — Server-Sent Events stream of the room's
 * state, redacted for the given token. The client's EventSource reconnects
 * automatically; on (re)connect the current snapshot is sent immediately.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!roomExists(id)) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const token = new URL(req.url).searchParams.get('token');
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const send = (snapshot: RoomSnapshot) => {
        safeEnqueue(`data: ${JSON.stringify(snapshot)}\n\n`);
      };

      const unsubscribe = subscribe(id, token, send);

      // Heartbeat keeps proxies from closing an idle connection.
      const heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
