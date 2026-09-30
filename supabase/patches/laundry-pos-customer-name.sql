-- Customer name on laundry POS sales and receipts
alter table public.laundry_pos_sales
  add column if not exists customer_name text not null default 'Walk-in customer';
