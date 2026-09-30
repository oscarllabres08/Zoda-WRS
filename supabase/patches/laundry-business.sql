-- Admin web: Laundry business (services catalog + POS + sales)

create table if not exists public.laundry_services (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laundry_services_seller_idx on public.laundry_services (seller_id, sort_order, name);

create table if not exists public.laundry_pos_sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  receipt_no text not null,
  customer_name text not null default 'Walk-in customer',
  cash_received numeric(12,2),
  change_due numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists laundry_pos_sales_seller_created_idx on public.laundry_pos_sales (seller_id, created_at desc);

create table if not exists public.laundry_pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  laundry_pos_sale_id uuid not null references public.laundry_pos_sales(id) on delete cascade,
  service_id uuid references public.laundry_services(id) on delete set null,
  service_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists laundry_pos_sale_items_sale_idx on public.laundry_pos_sale_items (laundry_pos_sale_id);

alter table public.laundry_services enable row level security;
alter table public.laundry_pos_sales enable row level security;
alter table public.laundry_pos_sale_items enable row level security;

drop policy if exists "laundry_services seller all" on public.laundry_services;
create policy "laundry_services seller all"
on public.laundry_services for all
using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

drop policy if exists "laundry_pos_sales seller read" on public.laundry_pos_sales;
drop policy if exists "laundry_pos_sales seller insert" on public.laundry_pos_sales;
create policy "laundry_pos_sales seller read"
on public.laundry_pos_sales for select
using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

create policy "laundry_pos_sales seller insert"
on public.laundry_pos_sales for insert
with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));

drop policy if exists "laundry_pos_sale_items seller read" on public.laundry_pos_sale_items;
drop policy if exists "laundry_pos_sale_items seller insert" on public.laundry_pos_sale_items;
create policy "laundry_pos_sale_items seller read"
on public.laundry_pos_sale_items for select
using (
  exists (
    select 1 from public.laundry_pos_sales s
    where s.id = laundry_pos_sale_id
      and s.seller_id = public.seller_business_id(auth.uid())
  )
);

create policy "laundry_pos_sale_items seller insert"
on public.laundry_pos_sale_items for insert
with check (
  exists (
    select 1 from public.laundry_pos_sales s
    where s.id = laundry_pos_sale_id
      and s.seller_id = public.seller_business_id(auth.uid())
      and public.is_seller(auth.uid())
  )
);
