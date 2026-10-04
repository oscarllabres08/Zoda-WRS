/** True when PostgREST reports a missing RPC (404 / PGRST202 / schema cache). */
export function isRpcNotFound(err: {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}): boolean {
  if (err.status === 404) return true;
  if (err.code === 'PGRST202') return true;
  const m = (err.message ?? '').toLowerCase();
  return (
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('42883') ||
    m.includes('404') ||
    m.includes('pgrst202')
  );
}
