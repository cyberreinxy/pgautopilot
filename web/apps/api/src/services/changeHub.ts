import type { LiveChangeEvent } from "@pgautopilot/contracts";

export type ChangeListener = (event: LiveChangeEvent) => void;

export class ChangeHub {
  private readonly listeners = new Set<ChangeListener>();

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(event: LiveChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
