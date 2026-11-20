// "Something changed the numbers" (check-in, payment, goal…): screens listening reload quietly.
type Listener = () => void;
const listeners = new Set<Listener>();

export function emitDataChanged(): void {
  for (const l of [...listeners]) l();
}

export function onDataChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
