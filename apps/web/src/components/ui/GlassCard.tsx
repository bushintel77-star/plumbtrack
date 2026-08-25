import type { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  /** Tab index for keyboard navigation on interactive cards. */
  tabIndex?: number;
  /** Click handler for interactive cards. */
  onClick?: () => void;
  /** Accessible label for interactive cards. */
  ariaLabel?: string;
}

/** Premium surface primitive with frosted glass, layered shadow, haptic press. */
export function GlassCard({
  children,
  className = "",
  interactive = false,
  tabIndex,
  onClick,
  ariaLabel,
}: GlassCardProps) {
  const classes = [
    "surface-card p-4",
    interactive ? "surface-card--interactive haptic cursor-pointer" : "",
    !interactive ? "animate-enter" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        tabIndex={tabIndex}
        className={`${classes} block w-full text-left`}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }

  return <div className={classes}>{children}</div>;
}