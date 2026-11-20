// After login, go back to where the person was headed (invite) — only app-relative paths.
export function safeNext(next: string | string[] | null | undefined, fallback = '/inicio'): string {
  const n = Array.isArray(next) ? next[0] : next;
  return n && n.startsWith('/') && !n.startsWith('//') ? n : fallback;
}
