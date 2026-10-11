-- Hide walk-in POS customer names from seller/admin customer lists (sales history unchanged).

create table if not exists public.seller_hidden_pos_customers (
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  customer_name_key text not null,
  created_at timestamptz not null default now(),
  primary key (seller_id, customer_name_key)
);

create index if not exists seller_hidden_pos_customers_seller_idx
  on public.seller_hidden_pos_customers (seller_id);

alter table public.seller_hidden_pos_customers enable row level security;

drop policy if exists "seller_hidden_pos seller read own" on public.seller_hidden_pos_customers;
create policy "seller_hidden_pos seller read own"
  on public.seller_hidden_pos_customers for select
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  );

drop policy if exists "seller_hidden_pos seller insert own" on public.seller_hidden_pos_customers;
create policy "seller_hidden_pos seller insert own"
  on public.seller_hidden_pos_customers for insert
  with check (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
    and char_length(trim(customer_name_key)) > 0
  );

drop policy if exists "seller_hidden_pos seller delete own" on public.seller_hidden_pos_customers;
create policy "seller_hidden_pos seller delete own"
  on public.seller_hidden_pos_customers for delete
  using (
    public.is_seller(auth.uid())
    and seller_id = public.seller_business_id(auth.uid())
  );

grant select, insert, delete on table public.seller_hidden_pos_customers to authenticated;
