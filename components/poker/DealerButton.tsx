'use client';

import { motion } from 'framer-motion';

interface DealerButtonProps {
  className?: string;
}

/** The dealer "button" — a white disc marked D, animated when it appears. */
export function DealerButton({ className = '' }: DealerButtonProps) {
  return (
    <motion.div
      layout
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-[0.65rem] font-black text-slate-800 shadow-lg ${className}`}
      title="Dealer button"
    >
      D
    </motion.div>
  );
}
