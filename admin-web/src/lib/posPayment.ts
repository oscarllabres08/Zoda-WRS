export type PosPaymentMethod = 'cash' | 'gcash';

export function normalizeCustomerName(name: string): string {
  return name.trim().toLowerCase();
}

export function posCustomerRowId(normalizedName: string): string {
  return `pos:${normalizedName}`;
}

export function isPosCustomerRowId(id: string): boolean {
  return id.startsWith('pos:');
}

export function posNameFromRowId(id: string): string | null {
  if (!isPosCustomerRowId(id)) return null;
  return id.slice(4);
}

export function formatPosPaymentMethod(method: string | null | undefined): string {
  const m = (method ?? '').toLowerCase();
  if (m === 'gcash') return 'GCash';
  if (m === 'cash') return 'Cash';
  return method ?? '—';
}
