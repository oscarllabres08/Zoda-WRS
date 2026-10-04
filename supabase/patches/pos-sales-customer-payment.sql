-- POS walk-in: optional customer name, Cash/GCash, paid vs unpaid.
-- Run in Supabase SQL Editor.

alter table public.pos_sales
  add column if not exists customer_name text,
  add column if not exists payment_method text not null default 'cash',
  add column if not exists payment_settled boolean not null default true,
  add column if not exists cash_received numeric(12,2),
  add column if not exists change_due numeric(12,2);

alter table public.pos_sales drop constraint if exists pos_sales_payment_method_check;
alter table public.pos_sales add constraint pos_sales_payment_method_check
  check (payment_method in ('cash', 'gcash'));

create index if not exists pos_sales_seller_customer_name_idx
  on public.pos_sales (seller_id, lower(trim(customer_name)))
  where customer_name is not null and trim(customer_name) <> '';

drop policy if exists "pos_sales seller update own" on public.pos_sales;
create policy "pos_sales seller update own"
on public.pos_sales for update
using (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()))
with check (public.seller_business_id(auth.uid()) = seller_id and public.is_seller(auth.uid()));
