import { createContext, useContext } from "react";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  showToast: () => undefined,
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
