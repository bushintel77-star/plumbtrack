import { cn } from "@/lib/utils"

/* Watermelon skeleton, FieldLoop-tinted: recessed chassis base with a
   sweeping etch highlight instead of a flat pulse. */

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-shine rounded-md", className)} {...props} />
}

export { Skeleton }
