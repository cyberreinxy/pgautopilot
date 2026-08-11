import { forwardRef } from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type {
  OverlayScrollbarsComponentProps,
  OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import { cn } from "../lib/cn";
import { SCROLLBAR_OPTIONS } from "../lib/scrollbarOptions";

export type { OverlayScrollbarsComponentRef };

export const ScrollArea = forwardRef<
  OverlayScrollbarsComponentRef,
  OverlayScrollbarsComponentProps
>(function ScrollArea({ className, options, ...props }, ref) {
  return (
    <OverlayScrollbarsComponent
      ref={ref}
      className={cn("pg-scroll", className)}
      options={{ ...SCROLLBAR_OPTIONS, ...options }}
      data-pg-os-managed
      {...props}
    />
  );
});
