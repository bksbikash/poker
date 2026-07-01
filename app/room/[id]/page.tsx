'use client';

import { useParams } from 'next/navigation';
import { RoomView } from '@/components/poker/RoomView';

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-6">
      {id ? <RoomView roomId={id} /> : <p className="text-slate-400">Invalid room.</p>}
    </main>
  );
}
