alter table public.people
  add column first_name text,
  add column last_name text;

update public.people
set
  first_name = coalesce(nullif(btrim(split_part(display_name, ' ', 1)), ''), 'User'),
  last_name = coalesce(nullif(btrim(regexp_replace(display_name, '^\\S+\\s*', '')), ''), 'User');

alter table public.people
  alter column first_name set not null,
  alter column last_name set not null,
  add constraint people_first_name_length check (char_length(btrim(first_name)) between 1 and 80),
  add constraint people_last_name_length check (char_length(btrim(last_name)) between 1 and 80);

create or replace function app_private.sync_person_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name := nullif(btrim(new.last_name), '');
  if new.first_name is null or new.last_name is null then
    raise exception 'First name and last name are required';
  end if;
  new.display_name := left(concat_ws(' ', new.first_name, new.last_name), 120);
  return new;
end;
$$;

create trigger people_sync_name
  before insert or update of first_name, last_name, display_name on public.people
  for each row execute function app_private.sync_person_name();

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_name text;
  supplied_first_name text;
  supplied_last_name text;
begin
  supplied_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New User'), 120);
  supplied_first_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), nullif(btrim(split_part(supplied_name, ' ', 1)), ''), 'New'), 80);
  supplied_last_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), nullif(btrim(regexp_replace(supplied_name, '^\\S+\\s*', '')), ''), 'User'), 80);
  insert into public.people (auth_user_id, first_name, last_name, display_name, primary_email)
  values (new.id, supplied_first_name, supplied_last_name, concat_ws(' ', supplied_first_name, supplied_last_name), nullif(lower(btrim(coalesce(new.email, ''))), ''));
  return new;
end;
$$;

create table public.person_subscription_records (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  plan_key text not null check (plan_key in ('consumer_free', 'agent', 'staff', 'broker')),
  status text not null check (status in ('free', 'paid', 'pending', 'cancelled', 'expired')),
  billing_period text not null check (billing_period in ('none', 'monthly', 'annual')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  provider text not null default 'manual_demo' check (char_length(provider) <= 60),
  provider_reference text check (provider_reference is null or char_length(provider_reference) <= 160),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index person_subscription_records_person_idx on public.person_subscription_records(person_id, status, ends_at desc);
alter table public.person_subscription_records enable row level security;
create policy person_subscriptions_read_self on public.person_subscription_records
  for select to authenticated
  using (person_id = app_private.current_person_id());
revoke all on public.person_subscription_records from anon, authenticated;
grant select on public.person_subscription_records to authenticated;
grant select, insert, update, delete on public.person_subscription_records to service_role;

insert into public.person_subscription_records (person_id, plan_key, status, billing_period, amount_cents, currency, starts_at, ends_at, provider)
select
  membership.person_id,
  case when bool_or(role.role_key = 'broker') then 'broker' when bool_or(role.role_key = 'agent') then 'agent' else 'staff' end,
  'paid',
  subscription.billing_period,
  case when bool_or(role.role_key = 'broker') then 15000 else 5000 end,
  subscription.currency,
  subscription.starts_at,
  subscription.ends_at,
  subscription.provider
from public.brokerage_memberships membership
join public.membership_roles role on role.membership_id = membership.id and role.ends_at is null
join lateral (
  select * from public.brokerage_subscription_records record
  where record.brokerage_id = membership.brokerage_id
    and record.status = 'paid'
    and record.starts_at <= now()
    and record.ends_at >= now()
  order by record.ends_at desc
  limit 1
) subscription on true
where membership.status = 'active'
  and not exists (select 1 from public.person_subscription_records existing where existing.person_id = membership.person_id and existing.status in ('paid', 'free'))
group by membership.person_id, subscription.billing_period, subscription.currency, subscription.starts_at, subscription.ends_at, subscription.provider;

insert into public.person_subscription_records (person_id, plan_key, status, billing_period, starts_at, provider)
select person.id, 'consumer_free', 'free', 'none', person.created_at, 'system'
from public.people person
where not exists (select 1 from public.person_subscription_records subscription where subscription.person_id = person.id and subscription.status in ('paid', 'free'));

revoke all on function app_private.sync_person_name() from public, anon, authenticated;
revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;
