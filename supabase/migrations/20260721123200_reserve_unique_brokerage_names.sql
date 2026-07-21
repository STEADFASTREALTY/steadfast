-- A brokerage name is a platform identity, not merely display text. Reserve a
-- normalized name as soon as a broker applies, then retain it for the created
-- brokerage so concurrent applications cannot create look-alike organizations.
create or replace function app_private.normalize_brokerage_name(candidate text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select nullif(regexp_replace(lower(btrim(candidate)), '[^a-z0-9]+', '', 'g'), '');
$$;

create table app_private.brokerage_name_reservations (
  normalized_name text primary key check (char_length(normalized_name) >= 2),
  brokerage_id uuid unique references public.brokerages(id) on delete cascade,
  registration_request_id uuid unique references public.professional_registration_requests(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  check ((brokerage_id is null) <> (registration_request_id is null))
);

insert into app_private.brokerage_name_reservations (normalized_name, brokerage_id)
select distinct on (app_private.normalize_brokerage_name(display_name))
  app_private.normalize_brokerage_name(display_name), id
from public.brokerages
order by app_private.normalize_brokerage_name(display_name),
  (status = 'active') desc,
  created_at asc;

create or replace function app_private.reserve_brokerage_name_for_brokerage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name_key text;
begin
  name_key := app_private.normalize_brokerage_name(new.display_name);
  if name_key is null then
    raise exception using errcode = '22023', message = 'A brokerage name is required';
  end if;

  delete from app_private.brokerage_name_reservations where brokerage_id = new.id;
  begin
    insert into app_private.brokerage_name_reservations (normalized_name, brokerage_id)
    values (name_key, new.id);
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'A brokerage with this name is already registered or awaiting ProperAP review';
  end;
  return new;
end;
$$;

create trigger reserve_brokerage_name_after_write
after insert or update of display_name on public.brokerages
for each row execute function app_private.reserve_brokerage_name_for_brokerage();

create or replace function app_private.reserve_brokerage_name_for_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name_key text;
begin
  if tg_op = 'DELETE' then
    delete from app_private.brokerage_name_reservations where registration_request_id = old.id;
    return old;
  end if;

  delete from app_private.brokerage_name_reservations where registration_request_id = new.id;
  if new.request_type <> 'broker' or new.status in ('denied', 'withdrawn') then
    return new;
  end if;

  name_key := app_private.normalize_brokerage_name(new.brokerage_name);
  if name_key is null then
    raise exception using errcode = '22023', message = 'A brokerage name is required';
  end if;

  begin
    insert into app_private.brokerage_name_reservations (normalized_name, registration_request_id)
    values (name_key, new.id);
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'A brokerage with this name is already registered or awaiting ProperAP review';
  end;
  return new;
end;
$$;

create trigger reserve_brokerage_name_after_registration_write
after insert or update of request_type, brokerage_name, status or delete on public.professional_registration_requests
for each row execute function app_private.reserve_brokerage_name_for_registration();

create or replace function public.brokerage_name_is_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = app_private, public, pg_temp
as $$
  with requested_name as (
    select app_private.normalize_brokerage_name(candidate) as normalized_name
  )
  select requested_name.normalized_name is not null
    and not exists (
      select 1
      from app_private.brokerage_name_reservations reservation
      where reservation.normalized_name = requested_name.normalized_name
    )
  from requested_name;
$$;

revoke all on function app_private.normalize_brokerage_name(text) from public, anon, authenticated;
revoke all on function app_private.reserve_brokerage_name_for_brokerage() from public, anon, authenticated;
revoke all on function app_private.reserve_brokerage_name_for_registration() from public, anon, authenticated;
revoke all on function public.brokerage_name_is_available(text) from public, anon, authenticated;
grant execute on function public.brokerage_name_is_available(text) to service_role;
