import { formatDistanceKm, haversineKm } from './geo';

export type OrderLocationFields = {
  latitude: number | null;
  longitude: number | null;
  delivery_distance_meters?: number | null;
};

export type DistanceReference = {
  lat: number;
  lng: number;
};

function hasValidPin(order: OrderLocationFields): boolean {
  return (
    typeof order.latitude === 'number' &&
    typeof order.longitude === 'number' &&
    Number.isFinite(order.latitude) &&
    Number.isFinite(order.longitude)
  );
}

function storedDistanceKm(order: OrderLocationFields): number | null {
  const m = order.delivery_distance_meters;
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  return m / 1000;
}

/** Live distance from seller GPS/store to order pin, else saved store→customer distance at checkout. */
export function orderDistanceKm(order: OrderLocationFields, reference: DistanceReference | null): number | null {
  if (reference && hasValidPin(order)) {
    return haversineKm(reference.lat, reference.lng, order.latitude!, order.longitude!);
  }
  return storedDistanceKm(order);
}

export function formatOrderDistance(km: number | null): string | null {
  if (km == null) return null;
  return formatDistanceKm(km);
}

export type OrderDistanceDisplay =
  | { kind: 'distance'; label: string }
  | { kind: 'no-pin' }
  | { kind: 'unavailable' };

export function getOrderDistanceDisplay(
  order: OrderLocationFields,
  reference: DistanceReference | null
): OrderDistanceDisplay {
  const km = orderDistanceKm(order, reference);
  if (km != null) {
    return { kind: 'distance', label: formatDistanceKm(km) };
  }
  if (reference && !hasValidPin(order) && storedDistanceKm(order) == null) {
    return { kind: 'no-pin' };
  }
  if (!reference && !hasValidPin(order) && storedDistanceKm(order) == null) {
    return { kind: 'unavailable' };
  }
  return { kind: 'unavailable' };
}
