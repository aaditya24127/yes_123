import { cn } from '@/lib/cn'

/** A small wooden peg that pins a print to its string. */
export function Clip({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 40"
      className={cn('h-10 w-5 drop-shadow-[0_2px_2px_rgb(60_48_30/0.25)]', className)}
      aria-hidden="true"
    >
      <rect x="2.5" y="0" width="15" height="40" rx="3.5" className="fill-accent-300" />
      <rect x="2.5" y="0" width="7.5" height="40" rx="3.5" className="fill-accent-200" />
      <path d="M10 2V38" className="stroke-accent-600/50" strokeWidth="0.8" />
      <path d="M2.5 15H17.5" className="stroke-accent-700/60" strokeWidth="1.2" />
      <circle cx="10" cy="15" r="2.6" className="fill-none stroke-teal-700" strokeWidth="1.3" />
    </svg>
  )
}
