import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface RiskConfirmRequest {
  title: string;
  message: ReactNode;
  detail?: string;
  action: () => void | Promise<void>;
}

export function useRiskConfirm() {
  const [request, setRequest] = useState<RiskConfirmRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const actionRef = useRef<(() => void | Promise<void>) | null>(null);

  const ask = useCallback((next: RiskConfirmRequest) => {
    actionRef.current = next.action;
    setRequest({ ...next, action: () => undefined });
  }, []);

  const confirm = useCallback(async () => {
    const action = actionRef.current;
    if (!action) return;
    setConfirming(true);
    try {
      await action();
      setRequest(null);
    } finally {
      setConfirming(false);
      actionRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    setRequest(null);
    actionRef.current = null;
  }, []);

  return {
    request: ask,
    confirm,
    cancel,
    open: Boolean(request),
    title: request?.title ?? "",
    message: request?.message ?? "",
    detail: request?.detail,
    confirming,
  };
}
