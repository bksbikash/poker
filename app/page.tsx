'use client';

import { CreateRoom } from '@/components/poker/CreateRoom';

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-6">
      <CreateRoom />
    </main>
  );
}
