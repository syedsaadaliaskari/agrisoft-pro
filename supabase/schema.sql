-- Agri Soft Pro — Supabase / Postgres schema (cloud source of truth)
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Desktop keeps SQLite offline; this is for sync later.
-- Project: https://vbyqlfxcfxijmrvilupp.supabase.co

create extension if not exists "pgcrypto";

-- ─── Tenancy ─────────────────────────────────────────────────

create table if not exists public.tenants (
  id text primary key,
  name text not null,
  slug text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Helper columns used on synced shop tables:
--   tenant_id  — which shop owns the row
--   deleted_at — soft delete for sync
--   updated_at — pull cursor / LWW

-- ─── Auth / RBAC (shop-local users mirrored to cloud) ─────────

create table if not exists public.roles (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create table if not exists public.permissions (
  id text primary key,
  code text not null unique,
  module text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  role_id text not null references public.roles (id) on delete cascade,
  permission_id text not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (role_id, permission_id)
);

create table if not exists public.users (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  username text not null,
  password_hash text not null,
  full_name text not null,
  email text,
  phone text,
  role_id text not null references public.roles (id),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, username)
);

create index if not exists users_tenant_updated_idx on public.users (tenant_id, updated_at);

-- ─── Settings / audit ────────────────────────────────────────

create table if not exists public.settings (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  key text not null,
  value text,
  group_name text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, key)
);

create table if not exists public.audit_logs (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  user_id text references public.users (id),
  action text not null,
  module text not null,
  entity_id text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists audit_tenant_created_idx on public.audit_logs (tenant_id, created_at);

-- ─── Masters ─────────────────────────────────────────────────

create table if not exists public.units (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  short_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create index if not exists units_tenant_updated_idx on public.units (tenant_id, updated_at);

create table if not exists public.categories (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  parent_id text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create index if not exists categories_tenant_updated_idx on public.categories (tenant_id, updated_at);

create table if not exists public.taxes (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  rate double precision not null default 0,
  is_inclusive boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create table if not exists public.discounts (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  type text not null default 'percent',
  value double precision not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create table if not exists public.additions (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  type text not null default 'fixed',
  value double precision not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create table if not exists public.products (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  category_id text references public.categories (id),
  unit_id text references public.units (id),
  brand text,
  gender text,
  season text,
  cost_price double precision not null default 0,
  sale_price double precision not null default 0,
  wholesale_price double precision default 0,
  tax_id text,
  reorder_level double precision not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, sku)
);

create index if not exists products_tenant_updated_idx on public.products (tenant_id, updated_at);
create index if not exists products_tenant_name_idx on public.products (tenant_id, name);

create table if not exists public.product_variants (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  sku text not null,
  barcode text,
  size text not null,
  color text not null,
  cost_price double precision,
  sale_price double precision,
  stock_qty double precision not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, sku),
  unique (tenant_id, product_id, size, color)
);

create index if not exists variants_tenant_updated_idx on public.product_variants (tenant_id, updated_at);
create index if not exists variants_product_idx on public.product_variants (product_id);

-- ─── Parties ─────────────────────────────────────────────────

create table if not exists public.customers (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  phone text,
  email text,
  address text,
  city text,
  opening_balance double precision not null default 0,
  balance_type text not null default 'debit',
  credit_limit double precision default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index if not exists customers_tenant_updated_idx on public.customers (tenant_id, updated_at);
create index if not exists customers_tenant_name_idx on public.customers (tenant_id, name);

create table if not exists public.vendors (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  phone text,
  email text,
  address text,
  city text,
  opening_balance double precision not null default 0,
  balance_type text not null default 'credit',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index if not exists vendors_tenant_updated_idx on public.vendors (tenant_id, updated_at);

-- ─── Accounts / vouchers ─────────────────────────────────────

create table if not exists public.accounts (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null,
  parent_id text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  opening_balance double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index if not exists accounts_tenant_updated_idx on public.accounts (tenant_id, updated_at);

create table if not exists public.vouchers (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  voucher_no text not null,
  voucher_type text not null,
  voucher_date text not null,
  party_type text,
  party_id text,
  account_id text references public.accounts (id),
  reference_no text,
  notes text,
  subtotal double precision not null default 0,
  discount_amount double precision not null default 0,
  addition_amount double precision not null default 0,
  tax_amount double precision not null default 0,
  grand_total double precision not null default 0,
  paid_amount double precision not null default 0,
  status text not null default 'posted',
  created_by text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, voucher_no)
);

create index if not exists vouchers_tenant_updated_idx on public.vouchers (tenant_id, updated_at);
create index if not exists vouchers_tenant_date_idx on public.vouchers (tenant_id, voucher_date);

create table if not exists public.voucher_entries (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  voucher_id text not null references public.vouchers (id) on delete cascade,
  account_id text not null references public.accounts (id),
  debit double precision not null default 0,
  credit double precision not null default 0,
  narration text,
  line_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists voucher_entries_voucher_idx on public.voucher_entries (voucher_id);

-- ─── Stock movements ─────────────────────────────────────────

create table if not exists public.stock_movements (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  variant_id text not null references public.product_variants (id),
  movement_type text not null,
  quantity double precision not null,
  reference_type text,
  reference_id text,
  notes text,
  created_by text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists stock_movements_tenant_updated_idx on public.stock_movements (tenant_id, updated_at);
create index if not exists stock_movements_variant_idx on public.stock_movements (variant_id);

-- ─── Sales ───────────────────────────────────────────────────

create table if not exists public.sales (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  voucher_id text not null references public.vouchers (id),
  invoice_no text not null,
  invoice_date text not null,
  customer_id text references public.customers (id),
  payment_mode text not null default 'cash',
  subtotal double precision not null default 0,
  discount_amount double precision not null default 0,
  addition_amount double precision not null default 0,
  tax_amount double precision not null default 0,
  grand_total double precision not null default 0,
  paid_amount double precision not null default 0,
  notes text,
  status text not null default 'completed',
  created_by text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, invoice_no)
);

create index if not exists sales_tenant_updated_idx on public.sales (tenant_id, updated_at);
create index if not exists sales_tenant_date_idx on public.sales (tenant_id, invoice_date);

create table if not exists public.sale_items (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  sale_id text not null references public.sales (id) on delete cascade,
  variant_id text not null references public.product_variants (id),
  product_name text not null,
  size text,
  color text,
  quantity double precision not null,
  unit_price double precision not null,
  cost_price double precision not null default 0,
  discount_amount double precision not null default 0,
  tax_amount double precision not null default 0,
  line_total double precision not null,
  line_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

create table if not exists public.sale_returns (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  voucher_id text not null references public.vouchers (id),
  return_no text not null,
  return_date text not null,
  sale_id text references public.sales (id),
  customer_id text references public.customers (id),
  subtotal double precision not null default 0,
  tax_amount double precision not null default 0,
  grand_total double precision not null default 0,
  notes text,
  created_by text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, return_no)
);

create table if not exists public.sale_return_items (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  sale_return_id text not null references public.sale_returns (id) on delete cascade,
  variant_id text not null references public.product_variants (id),
  quantity double precision not null,
  unit_price double precision not null,
  line_total double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ─── Purchases ───────────────────────────────────────────────

create table if not exists public.purchases (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  voucher_id text not null references public.vouchers (id),
  invoice_no text not null,
  invoice_date text not null,
  vendor_id text references public.vendors (id),
  payment_mode text not null default 'credit',
  subtotal double precision not null default 0,
  discount_amount double precision not null default 0,
  addition_amount double precision not null default 0,
  tax_amount double precision not null default 0,
  grand_total double precision not null default 0,
  paid_amount double precision not null default 0,
  notes text,
  status text not null default 'completed',
  created_by text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, invoice_no)
);

create index if not exists purchases_tenant_updated_idx on public.purchases (tenant_id, updated_at);

create table if not exists public.purchase_items (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  purchase_id text not null references public.purchases (id) on delete cascade,
  variant_id text not null references public.product_variants (id),
  product_name text not null,
  size text,
  color text,
  quantity double precision not null,
  unit_cost double precision not null,
  discount_amount double precision not null default 0,
  tax_amount double precision not null default 0,
  line_total double precision not null,
  line_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.purchase_returns (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  voucher_id text not null references public.vouchers (id),
  return_no text not null,
  return_date text not null,
  purchase_id text references public.purchases (id),
  vendor_id text references public.vendors (id),
  subtotal double precision not null default 0,
  tax_amount double precision not null default 0,
  grand_total double precision not null default 0,
  notes text,
  created_by text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, return_no)
);

create table if not exists public.purchase_return_items (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  purchase_return_id text not null references public.purchase_returns (id) on delete cascade,
  variant_id text not null references public.product_variants (id),
  quantity double precision not null,
  unit_cost double precision not null,
  line_total double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ─── Document counters ───────────────────────────────────────

create table if not exists public.document_counters (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  doc_type text not null,
  prefix text not null,
  next_number integer not null default 1,
  pad_length integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, doc_type)
);

-- ─── Platform (vendor Super Admin — not per-shop ERP) ────────

create table if not exists public.client_companies (
  id text primary key,
  company_name text not null,
  area text not null,
  joined_at text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists client_companies_area_idx on public.client_companies (area);

create table if not exists public.licenses (
  id text primary key,
  name text not null,
  install_id text not null,
  plan text not null,
  activated_at text not null,
  expires_at text,
  notes text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists licenses_install_idx on public.licenses (install_id);

-- ─── Dev seed: one demo tenant (optional) ────────────────────

insert into public.tenants (id, name, slug)
values ('tenant-dev-001', 'Agri Soft Pro Dev Shop', 'agrisoft-pro-dev')
on conflict (id) do nothing;
