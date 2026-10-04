-- Separate WRS vs Laundry expense records (same store owner).

alter table public.business_expenses
  add column if not exists business_unit text not null default 'wrs'
  check (business_unit in ('wrs', 'laundry'));

create index if not exists business_expenses_seller_unit_date_idx
  on public.business_expenses (seller_id, business_unit, expense_date desc);
