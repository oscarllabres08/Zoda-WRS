import { haversineMeters } from './geo';

/** Inclusive: 500 m and below = free delivery. */
export const FREE_DELIVERY_MAX_METERS = 500;

export const DELIVERY_FEE_PESOS_PER_CONTAINER = 5;

export type DeliveryFeeLine = {
  product: { category?: 'water' | 'other' | null; name?: string };
  qty: number;
};

/** Filled gallon / water refill delivered — not empty container or accessory purchases. */
export function isWaterRefillDeliveryUnit(product: {
  name?: string;
  category?: 'water' | 'other' | null;
}): boolean {
  const name = (product.name ?? '').trim();
  if (!name) return false;
  const n = name.toLowerCase();

  const refillOrWater = /refill|mineral|alkaline|distilled|purified|drinking\s*water|nag\s*refill/.test(n);
  const emptyContainerOrAccessory =
    /(?:^|\b)(?:empty\s*)?(?:gallon\s*)?(?:container|jug(?:\s*only)?|bottle\s*only|dispenser|cooler|slim\s*jug|round\s*jug)(?:\s*only)?(?:\b|$)/.test(
      n
    ) ||
    (/container|gallon jug|jug only|empty gallon|new container/.test(n) && !refillOrWater);

  if (emptyContainerOrAccessory) return false;

  const cat = product.category ?? 'water';
  if (cat === 'water') return true;

  return refillOrWater;
}

export function countDeliveryContainers(lines: DeliveryFeeLine[]): number {
  return lines.reduce((n, l) => (isWaterRefillDeliveryUnit(l.product) ? n + l.qty : n), 0);
}

export type DeliveryFeeQuote = {
  fee: number;
  distanceMeters: number | null;
  containerCount: number;
  /** Human-readable summary for checkout UI */
  summary: string;
};

export function computeDeliveryFee(params: {
  storeLat: number | null;
  storeLng: number | null;
  customerLat: number | null;
  customerLng: number | null;
  containerCount: number;
}): DeliveryFeeQuote {
  const { storeLat, storeLng, customerLat, customerLng, containerCount } = params;

  if (
    storeLat == null ||
    storeLng == null ||
    customerLat == null ||
    customerLng == null ||
    !Number.isFinite(storeLat) ||
    !Number.isFinite(storeLng) ||
    !Number.isFinite(customerLat) ||
    !Number.isFinite(customerLng)
  ) {
    return {
      fee: 0,
      distanceMeters: null,
      containerCount,
      summary: 'Use Current Location to see delivery fee (free within 500 m of the store).',
    };
  }

  const distanceMeters = haversineMeters(storeLat, storeLng, customerLat, customerLng);

  if (distanceMeters <= FREE_DELIVERY_MAX_METERS) {
    return {
      fee: 0,
      distanceMeters,
      containerCount,
      summary: `Free delivery — about ${Math.round(distanceMeters)} m from store (500 m or less).`,
    };
  }

  const fee = containerCount * DELIVERY_FEE_PESOS_PER_CONTAINER;
  if (containerCount <= 0) {
    return {
      fee: 0,
      distanceMeters,
      containerCount,
      summary: `About ${Math.round(distanceMeters)} m — no water refills in cart (empty containers/accessories do not add delivery fee).`,
    };
  }

  return {
    fee,
    distanceMeters,
    containerCount,
    summary: `About ${Math.round(distanceMeters)} m — ₱${DELIVERY_FEE_PESOS_PER_CONTAINER} × ${containerCount} water refill${containerCount === 1 ? '' : 's'} = ₱${fee.toFixed(2)} delivery fee.`,
  };
}
