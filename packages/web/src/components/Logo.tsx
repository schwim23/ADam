interface Props {
  size?: number;
  className?: string;
}

/**
 * Brand mark for the publisher-analytics agent: three ascending bars in a tight,
 * weight-balanced glyph. Reads at any size from 16px to 96px. `currentColor` so
 * it inherits the foreground of whatever element wraps it.
 */
export function Logo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="3.5" y="13.5" width="4" height="6.5" rx="1" fill="currentColor" />
      <rect x="10" y="9" width="4" height="11" rx="1" fill="currentColor" />
      <rect x="16.5" y="4" width="4" height="16" rx="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Logo with a soft framed background — for avatar-style placements.
 */
export function LogoBadge({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-fg)] ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <Logo size={Math.round(size * 0.6)} />
    </span>
  );
}
