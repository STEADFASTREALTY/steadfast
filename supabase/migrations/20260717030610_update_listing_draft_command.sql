begin;

create table public.update_listing_draft_commands (
  listing_id uuid primary key,
  expected_lock_version integer not null check (expected_lock_version > 0),
  save_mode text not null check (save_mode in ('autosave', 'manual')),
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

alter table public.update_listing_draft_commands enable row level security;

create policy update_listing_draft_authenticated_insert
  on public.update_listing_draft_commands
  for insert to authenticated
  with check (app_private.current_person_id() is not null);

create function app_private.process_update_listing_draft_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  actor_membership public.brokerage_memberships%rowtype;
  target_listing public.listings%rowtype;
  target_version public.listing_versions%rowtype;
  jamaica_id uuid;
  target_area public.administrative_areas%rowtype;
  normalized_address text;
  property_fingerprint text;
  target_property_id uuid;
  target_address_id uuid;
  calculated_public_location_label text;
  draft_hash text;
  saved_changed_fields text[];
begin
  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into target_listing
  from public.listings
  where id = new.listing_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Listing draft not found';
  end if;

  select * into actor_membership
  from public.brokerage_memberships
  where person_id = actor_person_id
    and brokerage_id = target_listing.brokerage_id
    and status = 'active'
  limit 1;

  if not found or not (
    app_private.has_brokerage_permission(target_listing.brokerage_id, 'listing.manage')
    or target_listing.created_by_person_id = actor_person_id
    or exists (
      select 1
      from public.listing_assignments as assignment
      join public.brokerage_memberships as membership
        on membership.id = assignment.agent_membership_id
      where assignment.listing_id = target_listing.id
        and assignment.status = 'active'
        and membership.person_id = actor_person_id
        and membership.status = 'active'
    )
  ) then
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;

  if target_listing.lifecycle_state <> 'draft' then
    raise exception using errcode = '55000', message = 'Only an unsubmitted draft can be edited';
  end if;
  if target_listing.lock_version <> new.expected_lock_version then
    raise exception using errcode = '40001', message = 'Draft changed since it was opened';
  end if;

  select * into target_version
  from public.listing_versions
  where listing_id = target_listing.id and revision_state = 'working_draft'
  order by version_number desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'Editable listing version not found';
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
    convert_to(target_listing.brokerage_id::text || '|' || new.property_type || '|' || normalized_address, 'UTF8'),
    'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(property_fingerprint, 0));

  select id into target_property_id
  from public.properties
  where created_by_brokerage_id = target_listing.brokerage_id
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
      target_listing.brokerage_id, actor_person_id
    ) returning id into target_address_id;

    insert into public.properties (
      created_by_brokerage_id, created_by_person_id, property_type,
      address_id, address_fingerprint
    ) values (
      target_listing.brokerage_id, actor_person_id, new.property_type,
      target_address_id, property_fingerprint
    ) returning id into target_property_id;
  end if;

  calculated_public_location_label := case new.public_location_precision
    when 'exact' then btrim(new.address_line_1) || ', ' || target_area.name
    when 'street' then btrim(new.address_line_1) || ', ' || target_area.name
    when 'area' then target_area.name
    else null
  end;

  draft_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'purpose', new.purpose, 'property_type', new.property_type,
    'property_subtype', nullif(btrim(coalesce(new.property_subtype, '')), ''),
    'price', new.price, 'price_period', new.price_period,
    'title', btrim(new.title), 'description', btrim(new.description),
    'bedrooms', new.bedrooms, 'bathrooms', new.bathrooms,
    'building_area', new.building_area, 'land_area', new.land_area,
    'area_unit', new.area_unit, 'visibility', new.visibility,
    'public_location_precision', new.public_location_precision,
    'public_location_label', calculated_public_location_label
  )::text, 'UTF8'), 'sha256'), 'hex');

  select coalesce(array_agg(change_name order by change_name), '{}'::text[])
  into saved_changed_fields
  from (values
    ('address', target_property_id is distinct from target_listing.property_id),
    ('purpose', new.purpose is distinct from target_version.purpose),
    ('property_type', new.property_type is distinct from target_version.property_type),
    ('property_subtype', nullif(btrim(coalesce(new.property_subtype, '')), '') is distinct from target_version.property_subtype),
    ('price', new.price is distinct from target_version.price),
    ('price_period', new.price_period is distinct from target_version.price_period),
    ('title', btrim(new.title) is distinct from target_version.title),
    ('description', btrim(new.description) is distinct from target_version.description),
    ('bedrooms', new.bedrooms is distinct from target_version.bedrooms),
    ('bathrooms', new.bathrooms is distinct from target_version.bathrooms),
    ('building_area', new.building_area is distinct from target_version.building_area),
    ('land_area', new.land_area is distinct from target_version.land_area),
    ('area_unit', new.area_unit is distinct from target_version.area_unit),
    ('visibility', new.visibility is distinct from target_version.visibility),
    ('public_location_precision', new.public_location_precision is distinct from target_version.public_location_precision)
  ) as changes(change_name, has_changed)
  where has_changed;

  if cardinality(saved_changed_fields) = 0 then
    update public.listing_versions set content_hash = draft_hash where id = target_version.id;
    return null;
  end if;

  update public.listings
  set property_id = target_property_id,
      lock_version = lock_version + 1,
      updated_at = clock_timestamp()
  where id = target_listing.id;

  update public.listing_versions
  set purpose = new.purpose,
      property_type = new.property_type,
      property_subtype = nullif(btrim(coalesce(new.property_subtype, '')), ''),
      price = new.price,
      price_period = new.price_period,
      title = btrim(new.title),
      description = btrim(new.description),
      bedrooms = new.bedrooms,
      bathrooms = new.bathrooms,
      building_area = new.building_area,
      land_area = new.land_area,
      area_unit = new.area_unit,
      visibility = new.visibility,
      public_location_precision = new.public_location_precision,
      public_location_label = calculated_public_location_label,
      content_hash = draft_hash,
      changed_fields = saved_changed_fields
  where id = target_version.id;

  if new.save_mode = 'manual' then
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
      target_listing.brokerage_id, 'listing.draft_saved', 'listing',
      target_listing.id, 'web', gen_random_uuid(),
      jsonb_build_object('changed_fields', saved_changed_fields, 'version_number', target_version.version_number)
    );
  end if;

  return null;
end;
$$;

create trigger process_update_listing_draft_command
  before insert on public.update_listing_draft_commands
  for each row execute function app_private.process_update_listing_draft_command();

revoke all on function app_private.process_update_listing_draft_command()
  from public, anon, authenticated;
revoke all on public.update_listing_draft_commands from anon, authenticated;
grant insert on public.update_listing_draft_commands to authenticated;

comment on table public.update_listing_draft_commands is
  'Write-only optimistic-concurrency boundary for recoverable working-draft saves; command rows are never stored.';

commit;
