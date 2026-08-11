import { Suspense } from "react";
import type { ReactNode } from "react";
import { Spinner } from "@pgautopilot/ui";

export function RouteLoader({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
