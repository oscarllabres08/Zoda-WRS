export const EXPENSE_TYPES = [
  { value: 'water_bill', label: 'Water Bill' },
  { value: 'electric_bill', label: 'Electric Bill' },
  { value: 'salaries_wages', label: 'Salaries and wages' },
  { value: 'gas_allowance', label: 'Gas allowance' },
  { value: 'foods', label: 'Foods' },
  { value: 'others', label: 'Others' },
] as const;

export type ExpenseType = (typeof EXPENSE_TYPES)[number]['value'];

export function expenseTypeLabel(type: string, othersLabel?: string | null) {
  if (type === 'others') {
    const custom = othersLabel?.trim();
    return custom ? `Others — ${custom}` : 'Others';
  }
  return EXPENSE_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function todayDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → readable label for filters and list headers. */
export function formatExpenseDateLabel(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
