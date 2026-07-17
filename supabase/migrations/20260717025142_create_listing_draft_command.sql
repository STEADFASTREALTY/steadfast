begin;

create extension if not exists pgcrypto schema extensions;

create table public.create_listing_draft_commands (
  listing_id uuid primary key,
  administrative_area_id uuid not null references public.administrative_areas(id),
  address_line_1 text not null check (char_length(btrim(address_line_1)) between 2 and 200),
  address_line_2 text check (address_line_2 is null or char_length(btrim(address_line_2)) <= 200),
  postal_code text check (postal_code is null or char_length(btrim(postal_code)) <= 20),
  purpose text not null check (purpose in ('sale', 'long_term_rent')),
  property_type text not null check (property_type in ('residential', 'commercial', 'land', 'development')),
  property_subtype text check (property_subtype is null or char_length(btrim(property_subtype)) <= 80),
  price numeric(14,2) not null check (price > 0),
  price_period text check (price_period is null or price_period in ('month', 'year')),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  description text not null check (char_length(btrim(description)) between 20 and 10000),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 100),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms between 0 and 100),
  building_area numeric(14,2) check (building_area is null or building_area > 0),
  land_area numeric(14,2) check (land_area is null or land_area > 0),
  area_unit text check (area_unit is null or area_unit in ('sq_ft', 'sq_m', 'acre', 'hectare')),
  visibility text not null check (visibility in ('private', 'professional_network', 'public')),
  public_location_precision text not null check (public_location_precision in ('exact', 'street', 'area', 'hidden')),
  check ((purpose = 'sale' and price_period is null) or (purpose = 'long_term_rent' and price_period is not null)),
  check ((building_area is null and land_area is null) or area_unit is not null)
);

alter table public.create_listing_draft_commands enable row level security;

create policy create_listing_draft_authenticated_insert
  on public.create_listing_draft_commands
  for insert to authenticated
  with check (app_private.current_person_id() is not null);

create or replace function app_private.validate_active_listing_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and not exists (
    select 1
    from public.brokerage_memberships as membership
    join public.membership_roles as role on role.membership_id = membership.id
    where membership.id = new.agent_membership_id
      and membership.brokerage_id = new.brokerage_id
      and membership.status = 'active'
      and role.role_key in ('agent', 'broker')
      and role.starts_at <= now()
      and (role.ends_at is null or role.ends_at > now())
  ) then
    raise exception using errcode = '23514', message = 'Active assignment requires an active agent in the listing brokerage';
  end if;
  return new;
end;
$$;

create function app_private.process_create_listing_draft_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  actor_membership public.brokerage_memberships%rowtype;
  jamaica_id uuid;
  target_area public.administrative_areas%rowtype;
  normalized_address text;
  property_fingerprint text;
  target_property_id uuid;
  target_address_id uuid;
  assignment_id uuid;
  version_id uuid;
  property_reused boolean := false;
  public_location_label text;
begin
  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into actor_membership
  from public.brokerage_memberships
  where person_id = actor_person_id and status = 'active'
  order by starts_at desc
  limit 1
  for update;

  if not found
    or not app_private.has_brokerage_permission(actor_membership.brokerage_id, 'listing.create')
    or not exists (
      select 1 from public.membership_roles
      where membership_id = actor_membership.id
        and role_key in ('agent', 'broker')
        and starts_at <= now()
        and (ends_at is null or ends_at > now())
    ) then
    raise exception using errcode = '42501', message = 'Active agent listing access is required';
  end if;

  select id into jamaica_id from public.countries where code = 'JM';
  select * into target_area
  from public.administrative_areas
  where id = new.administrative_area_id and country_id = jamaica_id;
  if not found then
    raise exception using errcode = '22023', message = 'Choose a valid Jamaican parish';
  end if;

  normalized_address := lower(regexp_replace(
    concat_ws(' ', btrim(new.address_line_1), nullif(btrim(coalesce(new.address_line_2, '')), ''),
      nullif(btrim(coalesce(new.postal_code, '')), ''), target_area.name, 'Jamaica'),
    '[[:space:]]+', ' ', 'g'
  ));
  property_fingerprint := encode(extensions.digest(
    convert_to(actor_membership.brokerage_id::text || '|' || new.property_type || '|' || normalized_address, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(property_fingerprint, 0));

  select id into target_property_id
  from public.properties
  where created_by_brokerage_id = actor_membership.brokerage_id
    and address_fingerprint = property_fingerprint
  limit 1;

  if target_property_id is null then
    insert into public.property_addresses (
      country_id, administrative_area_id, address_line_1, address_line_2,
      postal_code, normalized_address, created_by_brokerage_id, created_by_person_id
    ) values (
      jamaica_id, target_area.id, btrim(new.address_line_1),
      nullif(btrim(coalesce(new.address_line_2, '')), ''),
      nullif(btrim(coalesce(new.postal_code, '')), ''), normalized_address,
      actor_membership.brokerage_id, actor_person_id
    ) returning id into target_address_id;

    insert into public.properties (
      created_by_brokerage_id, created_by_person_id, property_type,
      address_id, address_fingerprint
    ) values (
      actor_membership.brokerage_id, actor_person_id, new.property_type,
      target_address_id, property_fingerprint
    ) returning id into target_property_id;
  else
    property_reused := true;
  end if;

  insert into public.listings (
    id, brokerage_id, property_id, created_by_person_id
  ) values (
    new.listing_id, actor_membership.brokerage_id, target_property_id, actor_person_id
  );

  insert into public.listing_assignments (
    listing_id, brokerage_id, agent_membership_id, status, starts_at,
    assigned_by_person_id, reason
  ) values (
    new.listing_id, actor_membership.brokerage_id, actor_membership.id,
    'active', now(), actor_person_id, 'Assigned automatically to listing creator'
  ) returning id into assignment_id;

  public_location_label := case new.public_location_precision
    when 'exact' then btrim(new.address_line_1) || ', ' || target_area.name
    when 'street' then btrim(new.address_line_1) || ', ' || target_area.name
    when 'area' then target_area.name
    else null
  end;

  insert into public.listing_versions (
    listing_id, version_number, purpose, property_type, property_subtype,
    currency, price, price_period, title, description, bedrooms, bathrooms,
    building_area, land_area, area_unit, visibility, public_location_precision,
    public_location_label, created_by_person_id
  ) values (
    new.listing_id, 1, new.purpose, new.property_type,
    nullif(btrim(coalesce(new.property_subtype, '')), ''), 'JMD', new.price,
    new.price_period, btrim(new.title), btrim(new.description), new.bedrooms,
    new.bathrooms, new.building_area, new.land_area, new.area_unit,
    new.visibility, new.public_location_precision, public_location_label,
    actor_person_id
  ) returning id into version_id;

  update public.listings
  set current_assignment_id = assignment_id, updated_at = now()
  where id = new.listing_id;

  insert into public.listing_state_events (
    listing_id, from_state, to_state, source_version_id, actor_person_id, reason
  ) values (
    new.listing_id, null, 'draft', version_id, actor_person_id, 'Listing draft created'
  );

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action, target_type,
    target_id, source, correlation_id, after_summary
  ) values (
    actor_person_id,
    case when exists (
      select 1 from public.membership_roles
      where membership_id = actor_membership.id and role_key = 'broker'
        and starts_at <= now() and (ends_at is null or ends_at > now())
    ) then 'broker' else 'agent' end,
    actor_membership.brokerage_id, 'listing.draft_created', 'listing',
    new.listing_id, 'web', gen_random_uuid(),
    jsonb_build_object(
      'lifecycle_state', 'draft', 'version_number', 1,
      'purpose', new.purpose, 'property_type', new.property_type,
      'visibility_request', new.visibility, 'property_reused', property_reused
    )
  );

  return null;
end;
$$;

create trigger process_create_listing_draft_command
  before insert on public.create_listing_draft_commands
  for each row execute function app_private.process_create_listing_draft_command();

revoke all on function app_private.process_create_listing_draft_command()
  from public, anon, authenticated;
revoke all on public.create_listing_draft_commands from anon, authenticated;
grant insert on public.create_listing_draft_commands to authenticated;

comment on table public.create_listing_draft_commands is
  'Write-only transactional boundary that creates a private brokerage listing draft and never stores command rows.';

commit;
