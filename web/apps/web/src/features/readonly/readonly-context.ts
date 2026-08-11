import { createContext, useContext } from "react";

export interface ReadonlyContextValue {
  readonly: boolean | null;
  setReadonly: (value: boolean) => void;
}

export const ReadonlyContext = createContext<ReadonlyContextValue>({
  readonly: null,
  setReadonly: () => undefined,
});

export function useReadonlyContext(): ReadonlyContextValue {
  return useContext(ReadonlyContext);
}

export function useReadonly(): boolean {
  return useContext(ReadonlyContext).readonly === true;
}
