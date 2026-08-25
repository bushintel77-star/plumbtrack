"use client";

/** Shimmer skeleton line — width via className. */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton skeleton-line ${className}`} />;
}

/** Full card-height skeleton block. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`skeleton skeleton-card ${className}`}>
      <div className="p-4 space-y-3">
        <SkeletonLine className="w-16" />
        <SkeletonLine className="w-3/4" />
        <SkeletonLine className="w-1/2" />
      </div>
    </div>
  );
}

/** Circle/avatar skeleton. */
export function SkeletonAvatar({ size = 36 }: { size?: number }) {
  return <div className="skeleton skeleton-avatar" style={{ width: size, height: size }} />;
}

/** Grid of skeleton cards — e.g. while jobs/quotes load. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="p-4 space-y-3 animate-fade-in">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a message row. */
export function SkeletonMessage() {
  return (
    <div className="flex gap-3 px-4 py-2 animate-fade-in">
      <SkeletonAvatar size={28} />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="w-20" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-2/3" />
      </div>
    </div>
  );
}