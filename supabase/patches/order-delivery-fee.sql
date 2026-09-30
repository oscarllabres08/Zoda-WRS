-- Delivery fee snapshot on orders (customer app: ≤500 m free, 501+ = ₱5 per water container).

alter table public.orders add column if not exists delivery_fee numeric(12,2) not null default 0
  check (delivery_fee >= 0);

alter table public.orders add column if not exists delivery_distance_meters double precision;
