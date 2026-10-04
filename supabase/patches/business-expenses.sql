-- Store owner business expenses (admin web).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'business_expense_type') then
    create type public.business_expense_type as enum (
      'water_bill',
      'electric_bill',
      'salaries_wages',
      'gas_allowance',
      'foods',
      'others'
    );
  end if;
end $$;

-- If enum already existed, add gas_allowance for existing databases.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_expense_type' and e.enumlabel = 'gas_allowance'
  ) then
    alter type public.business_expense_type add value 'gas_allowance';
  end if;
end $$;

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(user_id) on delete cascade,
  business_unit text not null default 'wrs' check (business_unit in ('wrs', 'laundry')),
  expense_type public.business_expense_type not null,
  others_label text,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default (timezone('utc', now()))::date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists business_expenses_seller_date_idx
  on public.business_expenses (seller_id, expense_date desc);

alter table public.business_expenses enable row level security;

drop policy if exists "business_expenses owner read" on public.business_expenses;
create policy "business_expenses owner read"
on public.business_expenses for select
using (
  seller_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'seller'
      and coalesce(p.seller_team_role, 'owner') = 'owner'
  )
);

drop policy if exists "business_expenses owner insert" on public.business_expenses;
create policy "business_expenses owner insert"
on public.business_expenses for insert
with check (
  seller_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'seller'
      and coalesce(p.seller_team_role, 'owner') = 'owner'
  )
);

drop policy if exists "business_expenses owner update" on public.business_expenses;
create policy "business_expenses owner update"
on public.business_expenses for update
using (
  seller_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'seller'
      and coalesce(p.seller_team_role, 'owner') = 'owner'
  )
)
with check (seller_id = auth.uid());

drop policy if exists "business_expenses owner delete" on public.business_expenses;
create policy "business_expenses owner delete"
on public.business_expenses for delete
using (
  seller_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'seller'
      and coalesce(p.seller_team_role, 'owner') = 'owner'
  )
);
