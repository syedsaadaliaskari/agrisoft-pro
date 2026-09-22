-- Vendor Activated list for Super Admin (desktop + phone).
-- Run once in the Supabase SQL editor. Desktop uses service_role (bypasses RLS).
-- Phone Super Admin reads with the anon key: only live rows (deleted_at is null).

create table if not exists public.licenses (
  id text primary key,
  name text not null,
  install_id text not null,
  plan text not null,
  activated_at text not null,
  expires_at text,
  notes text,
  phone text,
  tenant_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.licenses add column if not exists phone text;
alter table public.licenses add column if not exists tenant_id text;
alter table public.licenses add column if not exists deleted_at timestamptz;
alter table public.licenses add column if not exists updated_at timestamptz;

create index if not exists licenses_install_idx on public.licenses (install_id);
create index if not exists licenses_deleted_idx on public.licenses (deleted_at);

alter table public.licenses enable row level security;

drop policy if exists licenses_select_live on public.licenses;
create policy licenses_select_live
  on public.licenses
  for select
  using (deleted_at is null);

grant select on public.licenses to anon, authenticated;
grant all on public.licenses to service_role;
