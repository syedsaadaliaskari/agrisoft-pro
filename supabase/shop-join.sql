-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Needed for shop code login (second PC / cashier).

alter table public.tenants add column if not exists join_code text;
alter table public.tenants add column if not exists plan text;
alter table public.tenants add column if not exists license_expires_at text;
alter table public.tenants add column if not exists license_name text;

create unique index if not exists tenants_join_code_uidx
  on public.tenants (join_code)
  where join_code is not null;

update public.tenants
set join_code = upper(substr(md5(id), 1, 8))
where join_code is null or btrim(join_code) = '';
