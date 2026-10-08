type Listener = () => void;

const listeners = new Set<Listener>();

export function onPendingReminderRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitPendingReminderRefresh(): void {
  listeners.forEach((fn) => fn());
}
