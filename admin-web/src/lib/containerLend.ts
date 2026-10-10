import type { SupabaseClient } from '@supabase/supabase-js';

import { joinContainerIds, parseContainerIds } from './containerReturn';
import { normalizeCustomerName } from './posPayment';

export type ContainerLendResult =
  | { ok: true }
  | { ok: false; message: string };

function parseRpcPayload(raw: unknown): { ok?: boolean; message?: string } | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as { ok?: boolean; message?: string };
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as { ok?: boolean; message?: string };
    } catch {
      return null;
    }
  }
  return null;
}

function rpcHint(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('could not find') || m.includes('pgrst202') || m.includes('404')) {
    return ' Run supabase/patches/pos-walkin-container.sql in the Supabase SQL Editor.';
  }
  return '';
}

/** Validate qty vs comma-separated container codes (optional). */
export function validateBorrowContainers(
  quantity: number,
  codesRaw: string
): { ok: true; containerNumbers: string | null } | { ok: false; message: string } {
  const codes = parseContainerIds(codesRaw);
  if (codes.length === 0) {
    if (quantity < 1) return { ok: false, message: 'Borrow quantity must be at least 1.' };
    return { ok: true, containerNumbers: null };
  }
  if (quantity !== codes.length) {
    return {
      ok: false,
      message: `Container codes (${codes.length}) must match quantity (${quantity}).`,
    };
  }
  return { ok: true, containerNumbers: joinContainerIds(codes) };
}

export async function recordContainerLend(
  supabase: SupabaseClient,
  params: {
    customerName: string;
    profileUserId?: string | null;
    quantity: number;
    containerNumbers?: string | null;
    posSaleId?: string | null;
  }
): Promise<ContainerLendResult> {
  const nums = params.containerNumbers?.trim() ? params.containerNumbers.trim() : null;
  const posSaleId = params.posSaleId ?? null;

  if (params.profileUserId) {
    const { data: raw, error } = await supabase.rpc('seller_record_container_lend_for_customer', {
      p_customer_id: params.profileUserId,
      p_quantity: params.quantity,
      p_container_numbers: nums,
      p_pos_sale_id: posSaleId,
    });
    if (error) return { ok: false, message: error.message + rpcHint(error.message) };
    const res = parseRpcPayload(raw);
    if (res?.ok === false) return { ok: false, message: res.message ?? 'Could not record borrowed containers.' };
    return { ok: true };
  }

  const name = params.customerName.trim();
  if (!name) return { ok: false, message: 'Customer name is required to record borrowed containers.' };

  const { data: raw, error } = await supabase.rpc('seller_record_pos_container_lend', {
    p_customer_name: name,
    p_quantity: params.quantity,
    p_container_numbers: nums,
    p_pos_sale_id: posSaleId,
  });
  if (error) return { ok: false, message: error.message + rpcHint(error.message) };
  const res = parseRpcPayload(raw);
  if (res?.ok === false) return { ok: false, message: res.message ?? 'Could not record borrowed containers.' };
  return { ok: true };
}

export function resolveProfileUserIdForPosName(
  customerName: string,
  options: { name: string; profileUserId?: string | null }[]
): string | null {
  const key = normalizeCustomerName(customerName);
  if (!key) return null;
  for (const o of options) {
    if (!o.profileUserId) continue;
    if (normalizeCustomerName(o.name) === key) return o.profileUserId;
  }
  return null;
}
