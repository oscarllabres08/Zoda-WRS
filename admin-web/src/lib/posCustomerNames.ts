import { normalizeCustomerName } from './posPayment';
import { supabase } from './supabase';

export type PosCustomerOption = {
  name: string;
  avatarPath: string | null;
  isPosOnly: boolean;
};

function mergeCustomerOptions(profileRows: { name: string; avatarPath: string | null }[], posNames: string[]): PosCustomerOption[] {
  const map = new Map<string, PosCustomerOption>();
  for (const row of profileRows) {
    const trimmed = row.name.trim();
    if (!trimmed) continue;
    map.set(normalizeCustomerName(trimmed), {
      name: trimmed,
      avatarPath: row.avatarPath,
      isPosOnly: false,
    });
  }
  for (const raw of posNames) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeCustomerName(trimmed);
    if (!map.has(key)) {
      map.set(key, { name: trimmed, avatarPath: null, isPosOnly: true });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function loadPosCustomerNames(businessId: string): Promise<PosCustomerOption[]> {
  const [{ data: posRows }, { data: profiles }] = await Promise.all([
    supabase
      .from('pos_sales')
      .select('customer_name')
      .eq('seller_id', businessId)
      .not('customer_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('profiles')
      .select('display_name,avatar_path')
      .eq('role', 'customer')
      .not('display_name', 'is', null)
      .limit(400),
  ]);

  const posNames = (posRows ?? []).map((r) => String(r.customer_name ?? ''));
  const profileRows = (profiles ?? []).map((p) => ({
    name: String(p.display_name ?? ''),
    avatarPath: (p.avatar_path as string | null) ?? null,
  }));
  return mergeCustomerOptions(profileRows, posNames);
}

export function filterCustomerNameSuggestions(
  options: PosCustomerOption[],
  query: string,
  limit = 8
): PosCustomerOption[] {
  const q = normalizeCustomerName(query);
  if (!q) return [];

  const scored: { option: PosCustomerOption; score: number }[] = [];
  for (const option of options) {
    const trimmed = option.name.trim();
    if (!trimmed) continue;
    const n = normalizeCustomerName(trimmed);
    if (n === q) continue;
    if (n.startsWith(q)) {
      scored.push({ option, score: 0 });
    } else if (n.split(/\s+/).some((word) => word.startsWith(q))) {
      scored.push({ option, score: 1 });
    } else if (n.includes(q)) {
      scored.push({ option, score: 2 });
    }
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.option.name.localeCompare(b.option.name, undefined, { sensitivity: 'base' })
  );
  return scored.slice(0, limit).map((s) => s.option);
}
