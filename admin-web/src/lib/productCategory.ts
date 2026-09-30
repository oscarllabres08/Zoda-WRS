export type SalesCategoryKey = 'water' | 'containers' | 'others' | 'accessories';

export function categoryFromProductName(name: string, dbCategory?: 'water' | 'other' | null): SalesCategoryKey {
  if (dbCategory === 'water') return 'water';
  const n = name.toLowerCase();
  if (/water|refill|mineral|alkaline|distilled/.test(n) && !/container|gallon jug|dispenser/.test(n)) {
    return 'water';
  }
  if (/container|gallon|jug|bottle|slim|round|cooler|dispenser/.test(n)) return 'containers';
  if (/accessory|cap|seal|pump|stand|cover|tap/.test(n)) return 'accessories';
  return 'others';
}

export const SALES_CATEGORY_LABELS: Record<SalesCategoryKey, string> = {
  water: 'Water',
  containers: 'Containers',
  others: 'Others',
  accessories: 'Accessories',
};
