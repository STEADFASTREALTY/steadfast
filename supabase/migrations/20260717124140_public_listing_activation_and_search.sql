create table public.public_listing_snapshots (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  approved_version_id uuid not null,
  brokerage_id uuid not null references public.brokerages(id),
  brokerage_name text not null check (char_length(brokerage_name) between 2 and 160),
  brokerage_slug text not null check (brokerage_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  assigned_agent_person_id uuid not null references public.people(id),
  assigned_agent_name text not null check (char_length(assigned_agent_name) between 1 and 120),
  assigned_agent_slug text check (
    assigned_agent_slug is null or assigned_agent_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  lifecycle_state text not null check (lifecycle_state in ('active', 'under_offer')),
  purpose text not null check (purpose in ('sale', 'long_term_rent')),
  property_type text not null check (property_type in ('residential', 'commercial', 'land', 'development')),
  property_subtype text check (property_subtype is null or char_length(property_subtype) <= 80),
  currency char(3) not null check (currency in ('JMD', 'USD')),
  price numeric(14,2) not null check (price > 0),
  price_period text check (price_period is null or price_period in ('month', 'year')),
  title text not null check (char_length(title) between 5 and 160),
  description text not null check (char_length(description) between 20 and 10000),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 100),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms between 0 and 100),
  building_area numeric(14,2) check (building_area is null or building_area > 0),
  land_area numeric(14,2) check (land_area is null or land_area > 0),
  area_unit text check (area_unit is null or area_unit in ('sq_ft', 'sq_m', 'acre', 'hectare')),
  administrative_area_id uuid not null references public.administrative_areas(id),
  administrative_area_code text not null check (char_length(administrative_area_code) between 2 and 20),
  administrative_area_name text not null check (char_length(administrative_area_name) between 2 and 120),
  public_location_precision text not null check (public_location_precision in ('exact', 'street', 'area', 'hidden')),
  public_location_label text check (public_location_label is null or char_length(public_location_label) <= 200),
  public_latitude double precision check (public_latitude is null or public_latitude between -90 and 90),
  public_longitude double precision check (public_longitude is null or public_longitude between -180 and 180),
  ready_media_count integer not null check (ready_media_count > 0),
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(property_subtype, '') || ' '
      || coalesce(property_type, '') || ' ' || coalesce(administrative_area_name, '') || ' '
      || coalesce(public_location_label, '') || ' ' || coalesce(brokerage_name, '')
    )
  ) stored,
  published_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key (approved_version_id, listing_id)
    references public.listing_versions(id, listing_id)
);

create index public_listing_snapshots_search_idx
  on public.public_listing_snapshots using gin (search_document);
create index public_listing_snapshots_area_idx
  on public.public_listing_snapshots (administrative_area_id, purpose, property_type);
create index public_listing_snapshots_brokerage_idx
  on public.public_listing_snapshots (brokerage_id, published_at desc);
create index public_listing_snapshots_price_idx
  on public.public_listing_snapshots (purpose, currency, price);

create table public.publication_records (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  surface text not null check (surface in ('marketplace', 'brokerage_site', 'agent_site', 'shared_agent_site')),
  status text not null check (status in ('active', 'removed')),
  approved_version_id uuid not null,
  published_at timestamptz not null,
  removed_at timestamptz,
  removal_reason text check (removal_reason is null or char_length(removal_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, surface),
  foreign key (approved_version_id, listing_id)
    references public.listing_versions(id, listing_id),
  check (
    (status = 'active' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create table public.activate_public_listing_commands (
  request_id uuid not null,
  listing_id uuid not null,
  approved_version_id uuid not null,
  expected_lock_version integer not null check (expected_lock_version > 0),
  confirm_publication boolean not null check (confirm_publication)
);

create function app_private.public_listing_is_eligible(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings as listing
    join public.brokerages as brokerage on brokerage.id = listing.brokerage_id
    join public.listing_versions as version
      on version.id = listing.current_approved_version_id
      and version.listing_id = listing.id
    join public.listing_assignments as assignment
      on assignment.id = listing.current_assignment_id
      and assignment.listing_id = listing.id
    join public.brokerage_memberships as membership
      on membership.id = assignment.agent_membership_id
      and membership.brokerage_id = listing.brokerage_id
    join public.people as person on person.id = membership.person_id
    where listing.id = target_listing_id
      and listing.lifecycle_state in ('active', 'under_offer')
      and listing.published_at is not null
      and brokerage.status = 'active'
      and version.revision_state = 'approved'
      and version.visibility = 'public'
      and version.content_hash is not null
      and assignment.status = 'active'
      and membership.status = 'active'
      and person.account_status = 'active'
      and exists (
        select 1 from public.membership_roles as role
        where role.membership_id = membership.id
          and role.role_key = 'agent'
          and role.starts_at <= now()
          and (role.ends_at is null or role.ends_at > now())
      )
  )
$$;

create function app_private.process_activate_public_listing_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  actor_membership public.brokerage_memberships%rowtype;
  target_listing public.listings%rowtype;
  approved_version public.listing_versions%rowtype;
  target_brokerage public.brokerages%rowtype;
  target_assignment public.listing_assignments%rowtype;
  target_agent_membership public.brokerage_memberships%rowtype;
  target_agent public.people%rowtype;
  target_agent_slug text;
  target_area public.administrative_areas%rowtype;
  target_duplicate_status text;
  ready_media_count integer;
  publication_time timestamptz := clock_timestamp();
  actor_effective_role text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Active person required';
  end if;

  select * into target_listing
  from public.listings where id = new.listing_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;

  select * into actor_membership
  from public.brokerage_memberships
  where brokerage_id = target_listing.brokerage_id
    and person_id = actor_person_id and status = 'active'
  limit 1;
  if not found
    or not app_private.has_brokerage_permission(target_listing.brokerage_id, 'listing.review') then
    raise exception using errcode = '42501', message = 'Listing publication authority is required';
  end if;

  if target_listing.lock_version <> new.expected_lock_version then
    raise exception using errcode = '40001', message = 'The listing changed before publication';
  end if;
  if target_listing.lifecycle_state <> 'approved_inactive'
    or target_listing.current_approved_version_id is distinct from new.approved_version_id then
    raise exception using errcode = '55000', message = 'Only the current approved inactive version can be published';
  end if;

  select * into approved_version
  from public.listing_versions
  where id = new.approved_version_id and listing_id = target_listing.id;
  if not found or approved_version.revision_state <> 'approved'
    or approved_version.visibility <> 'public'
    or approved_version.content_hash is null then
    raise exception using errcode = '55000', message = 'The approved version is not eligible for public visibility';
  end if;

  select * into target_brokerage
  from public.brokerages where id = target_listing.brokerage_id;
  if target_brokerage.status <> 'active' then
    raise exception using errcode = '55000', message = 'The brokerage is not eligible for publication';
  end if;

  select assignment.* into target_assignment
  from public.listing_assignments as assignment
  where assignment.id = target_listing.current_assignment_id
    and assignment.listing_id = target_listing.id
    and assignment.status = 'active';
  if not found then
    raise exception using errcode = '55000', message = 'Publication requires an active listing representative';
  end if;

  select membership.* into target_agent_membership
  from public.brokerage_memberships as membership
  where membership.id = target_assignment.agent_membership_id
    and membership.brokerage_id = target_listing.brokerage_id
    and membership.status = 'active';
  if not found or not exists (
    select 1 from public.membership_roles as role
    where role.membership_id = target_agent_membership.id
      and role.role_key = 'agent'
      and role.starts_at <= now()
      and (role.ends_at is null or role.ends_at > now())
  ) then
    raise exception using errcode = '55000', message = 'Publication requires an active agent representative';
  end if;

  select * into target_agent from public.people
  where id = target_agent_membership.person_id and account_status = 'active';
  if not found then
    raise exception using errcode = '55000', message = 'The assigned representative is not eligible';
  end if;
  select profile.public_slug into target_agent_slug
  from public.professional_profiles as profile
  where profile.person_id = target_agent.id;

  select area.* into target_area
  from public.properties as property
  join public.property_addresses as address on address.id = property.address_id
  join public.administrative_areas as area on area.id = address.administrative_area_id
  where property.id = target_listing.property_id
    and property.created_by_brokerage_id = target_listing.brokerage_id;
  if not found then
    raise exception using errcode = '55000', message = 'The property location is unavailable';
  end if;
  select property.duplicate_review_status into target_duplicate_status
  from public.properties as property
  where property.id = target_listing.property_id
    and property.created_by_brokerage_id = target_listing.brokerage_id;
  if target_duplicate_status not in ('clear', 'reviewed_distinct') then
    raise exception using errcode = '55000', message = 'The property record is not cleared for publication';
  end if;

  if approved_version.public_location_precision <> 'hidden'
    and approved_version.public_location_label is null then
    raise exception using errcode = '55000', message = 'The approved public location is incomplete';
  end if;

  select count(*)::integer into ready_media_count
  from public.listing_version_media as link
  join public.listing_media as media on media.id = link.media_id
  where link.listing_version_id = approved_version.id
    and media.status = 'ready';
  if ready_media_count < 1 then
    raise exception using errcode = '55000', message = 'Publication requires validated property media';
  end if;

  update public.listings
  set lifecycle_state = 'active', published_at = publication_time,
      unpublished_at = null, lock_version = lock_version + 1,
      updated_at = publication_time
  where id = target_listing.id;

  insert into public.listing_state_events (
    listing_id, from_state, to_state, source_version_id,
    actor_person_id, reason, occurred_at
  ) values (
    target_listing.id, 'approved_inactive', 'active', approved_version.id,
    actor_person_id, 'Authorized brokerage reviewer activated public publication',
    publication_time
  );

  insert into public.public_listing_snapshots (
    listing_id, approved_version_id, brokerage_id, brokerage_name,
    brokerage_slug, assigned_agent_person_id, assigned_agent_name,
    assigned_agent_slug, lifecycle_state, purpose, property_type,
    property_subtype, currency, price, price_period, title, description,
    bedrooms, bathrooms, building_area, land_area, area_unit,
    administrative_area_id, administrative_area_code,
    administrative_area_name, public_location_precision,
    public_location_label, public_latitude, public_longitude,
    ready_media_count, published_at, updated_at
  ) values (
    target_listing.id, approved_version.id, target_listing.brokerage_id,
    target_brokerage.display_name, target_brokerage.slug, target_agent.id,
    target_agent.display_name, target_agent_slug, 'active',
    approved_version.purpose, approved_version.property_type,
    approved_version.property_subtype, approved_version.currency,
    approved_version.price, approved_version.price_period,
    approved_version.title, approved_version.description,
    approved_version.bedrooms, approved_version.bathrooms,
    approved_version.building_area, approved_version.land_area,
    approved_version.area_unit, target_area.id, target_area.code,
    target_area.name, approved_version.public_location_precision,
    approved_version.public_location_label,
    case when approved_version.public_location_precision <> 'hidden'
      and approved_version.public_location is not null
      then extensions.st_y(approved_version.public_location::extensions.geometry)
      else null end,
    case when approved_version.public_location_precision <> 'hidden'
      and approved_version.public_location is not null
      then extensions.st_x(approved_version.public_location::extensions.geometry)
      else null end,
    ready_media_count, publication_time, publication_time
  );

  insert into public.publication_records (
    listing_id, surface, status, approved_version_id,
    published_at, removed_at, removal_reason, updated_at
  ) values (
    target_listing.id, 'marketplace', 'active', approved_version.id,
    publication_time, null, null, publication_time
  )
  on conflict (listing_id, surface) do update set
    status = 'active', approved_version_id = excluded.approved_version_id,
    published_at = excluded.published_at, removed_at = null,
    removal_reason = null, updated_at = excluded.updated_at;

  select case when exists (
    select 1 from public.membership_roles
    where membership_id = actor_membership.id and role_key = 'broker'
      and starts_at <= now() and (ends_at is null or ends_at > now())
  ) then 'broker' else 'broker_staff' end into actor_effective_role;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action,
    target_type, target_id, source, correlation_id, after_summary,
    occurred_at
  ) values (
    actor_person_id, actor_effective_role, target_listing.brokerage_id,
    'listing.activated', 'listing', target_listing.id, 'web', new.request_id,
    jsonb_build_object(
      'approved_version_id', approved_version.id,
      'surface', 'marketplace', 'lifecycle_state', 'active'
    ), publication_time
  );

  return null;
end;
$$;

create trigger process_activate_public_listing_command
  before insert on public.activate_public_listing_commands
  for each row execute function app_private.process_activate_public_listing_command();

create function app_private.remove_ineligible_public_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lifecycle_state not in ('active', 'under_offer') then
    delete from public.public_listing_snapshots where listing_id = new.id;
    update public.publication_records
    set status = 'removed', removed_at = coalesce(removed_at, clock_timestamp()),
        removal_reason = 'Listing is no longer publicly eligible',
        updated_at = clock_timestamp()
    where listing_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

create trigger remove_ineligible_public_snapshot
  after update of lifecycle_state on public.listings
  for each row
  when (old.lifecycle_state is distinct from new.lifecycle_state)
  execute function app_private.remove_ineligible_public_snapshot();

alter table public.public_listing_snapshots enable row level security;
alter table public.publication_records enable row level security;
alter table public.activate_public_listing_commands enable row level security;

create policy public_listing_snapshots_safe_read
  on public.public_listing_snapshots for select to anon, authenticated
  using (app_private.public_listing_is_eligible(listing_id));

create policy publication_records_brokerage_read
  on public.publication_records for select to authenticated
  using (
    exists (
      select 1 from public.listings as listing
      where listing.id = publication_records.listing_id
        and app_private.is_active_brokerage_member(listing.brokerage_id)
    )
  );

create policy activate_public_listing_authenticated_insert
  on public.activate_public_listing_commands for insert to authenticated
  with check ((select auth.uid()) is not null);

revoke all on table public.public_listing_snapshots from anon, authenticated;
grant select on table public.public_listing_snapshots to anon, authenticated;

revoke all on table public.publication_records from anon, authenticated;
grant select on table public.publication_records to authenticated;

revoke all on table public.activate_public_listing_commands from anon, authenticated;
grant insert on table public.activate_public_listing_commands to authenticated;

revoke all on function app_private.public_listing_is_eligible(uuid)
  from public;
grant execute on function app_private.public_listing_is_eligible(uuid)
  to anon, authenticated;
revoke all on function app_private.process_activate_public_listing_command()
  from public, anon, authenticated;
revoke all on function app_private.remove_ineligible_public_snapshot()
  from public, anon, authenticated;

comment on table public.public_listing_snapshots is
  'Sanitized anonymous projection rebuilt only from eligible approved listing content. It intentionally excludes raw addresses, drafts, reviews, audit data, and private media paths.';
comment on table public.activate_public_listing_commands is
  'Write-only brokerage publication command with server-enforced eligibility and optimistic concurrency.';
comment on function app_private.public_listing_is_eligible(uuid) is
  'Fail-closed dynamic eligibility guard for every anonymous public snapshot read.';
