import { cn } from "../lib/cn.js";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden className={cn("pg-skeleton", className)} />;
}
