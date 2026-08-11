import type { ReactNode } from "react";
import { useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ThemeProvider } from "../lib/theme";
import { ToastContext } from "../lib/toast";
import type { ToastTone } from "../lib/toast";
import { ReadonlyProvider } from "../features/readonly/ReadonlyContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
    },
  },
});

interface ProvidersProps {
  children: ReactNode;
}

const TOAST_BY_TONE: Record<ToastTone, (message: string) => string | number> = {
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
  info: (message) => toast.info(message),
  warning: (message) => toast.warning(message),
};

export function Providers({ children }: ProvidersProps) {
  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    TOAST_BY_TONE[tone](message);
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastContext.Provider value={{ showToast }}>
          <ReadonlyProvider>{children}</ReadonlyProvider>
        </ToastContext.Provider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast:
                "!rounded-lg !border !border-pg-border !bg-pg-surface !shadow-pg-md",
              title: "!text-[13px] !font-pg-sans !text-pg-text",
              description: "!text-xs !text-pg-dim",
              success: "!text-pg-text",
              error: "!text-pg-text",
              warning: "!text-pg-text",
              info: "!text-pg-text",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
