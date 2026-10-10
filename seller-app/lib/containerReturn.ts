import type { SupabaseClient } from '@supabase/supabase-js';

export type ContainerReturnResult =
  | { ok: true; outstandingRemaining?: number }
  | { ok: false; message: string };

/** Split stored container notes into individual IDs (comma or semicolon separated). */
export function parseContainerIds(notes: string | null | undefined): string[] {
  if (!notes?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of notes.split(/[,;]+/)) {
    const id = part.trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

/** Display list for UI when notes are missing but count is known. */
export function containerLabelsForCustomer(notes: string | null | undefined, outstanding: number): string[] {
  const parsed = parseContainerIds(notes);
  if (parsed.length >= outstanding && outstanding > 0) {
    return parsed.slice(0, outstanding);
  }
  if (parsed.length > 0) return parsed;
  return Array.from({ length: Math.max(0, outstanding) }, (_, i) => `#${i + 1}`);
}

export function joinContainerIds(ids: string[]): string {
  return ids.join(',');
}

function rpcHint(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('could not choose the best candidate function')) {
    return '\n\nRun supabase/patches/fix-container-return-overload.sql in the Supabase SQL Editor.';
  }
  if (
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('42883') ||
    m.includes('404') ||
    m.includes('pgrst202')
  ) {
    return '\n\nRun supabase/patches/fix-container-return-overload.sql in the Supabase SQL Editor.';
  }
  return '';
}

function isRpcNotFound(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('42883') ||
    m.includes('404') ||
    m.includes('pgrst202')
  );
}

function parseRpcPayload(raw: unknown): { ok?: boolean; message?: string; outstanding_remaining?: number } | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as { ok?: boolean; message?: string; outstanding_remaining?: number };
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as { ok?: boolean; message?: string; outstanding_remaining?: number };
    } catch {
      return null;
    }
  }
  return null;
}

export async function recordContainerReturn(
  supabase: SupabaseClient,
  params: {
    customerId: string;
    quantity: number;
    containerNumbers?: string | null;
  }
): Promise<ContainerReturnResult> {
  const baseArgs = {
    p_customer_id: params.customerId,
    p_quantity: params.quantity,
    p_order_id: null as null,
  };

  const nums = params.containerNumbers?.trim() ? params.containerNumbers.trim() : null;

  async function call(withNumbers: boolean) {
    const rpcArgs = {
      ...baseArgs,
      p_container_numbers: withNumbers && nums ? nums : null,
    };
    return supabase.rpc('seller_record_container_return', rpcArgs);
  }

  let { data: raw, error } = await call(!!nums);

  if (error && isRpcNotFound(error.message)) {
    const retry = await call(false);
    raw = retry.data;
    error = retry.error;
  }

  if (error) {
    return { ok: false, message: error.message + rpcHint(error.message) };
  }

  const res = parseRpcPayload(raw);
  if (res?.ok === false) {
    return { ok: false, message: res.message ?? 'Could not record return.' };
  }

  return { ok: true, outstandingRemaining: res?.outstanding_remaining };
}
