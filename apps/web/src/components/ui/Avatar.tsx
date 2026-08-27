"use client";

/**
 * Shared avatar — a member's identity colour carries wherever they appear.
 * Humans and bots both render their seeded colour; unknown senders fall
 * back to the neutral member token. `dot` marks live presence (open entry).
 */
export function Avatar({
  name,
  color,
  size = 28,
  round = true,
  dot = false,
  title,
}: {
  name: string;
  color?: string;
  size?: number;
  round?: boolean;
  dot?: boolean;
  title?: string;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={`relative inline-flex items-center justify-center font-bold text-on-accent shrink-0 select-none ${round ? "rounded-full" : "rounded-md"}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? "var(--bg-fallback-member)",
        fontSize: Math.max(9, Math.round(size * 0.4)),
      }}
      aria-hidden="true"
      {...(title ? { title } : {})}
    >
      {initials}
      {dot && (
        <span
          className="absolute -right-0.5 -bottom-0.5 rounded-full bg-complete"
          style={{ width: size * 0.32, height: size * 0.32, boxShadow: "0 0 0 2px var(--app-surface-solid)" }}
        />
      )}
    </span>
  );
}
