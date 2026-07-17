begin;

create extension if not exists postgis schema extensions;

create table public.administrative_areas (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  area_type text not null check (area_type in ('parish', 'district', 'province', 'state', 'territory')),
  code text not null check (char_length(code) between 2 and 20),
  name text not null check (char_length(name) between 2 and 120),
  boundary extensions.geometry(MultiPolygon, 4326),
  created_at timestamptz not null default now(),
  unique (country_id, code),
  unique (id, country_id)
);

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  administrative_area_id uuid not null references public.administrative_areas(id),
  name text not null check (char_length(name) between 2 and 120),
  normalized_name text not null check (char_length(normalized_name) between 2 and 160),
  centroid extensions.geography(Point, 4326),
  created_at timestamptz not null default now(),
  unique (administrative_area_id, normalized_name),
  unique (id, administrative_area_id)
);

create table public.property_addresses (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  administrative_area_id uuid not null,
  locality_id uuid,
  address_line_1 text not null check (char_length(address_line_1) between 2 and 200),
  address_line_2 text check (address_line_2 is null or char_length(address_line_2) <= 200),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  normalized_address text not null check (char_length(normalized_address) between 2 and 500),
  location extensions.geography(Point, 4326),
  geocode_provider text check (geocode_provider is null or char_length(geocode_provider) <= 60),
  geocode_reference text check (geocode_reference is null or char_length(geocode_reference) <= 300),
  geocode_confidence numeric(5,4) check (geocode_confidence is null or geocode_confidence between 0 and 1),
  verified_at timestamptz,
  verified_by_person_id uuid references public.people(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (administrative_area_id, country_id)
    references public.administrative_areas(id, country_id),
  foreign key (locality_id, administrative_area_id)
    references public.localities(id, administrative_area_id)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  created_by_brokerage_id uuid not null references public.brokerages(id),
  property_type text not null check (property_type in ('residential', 'commercial', 'land', 'development')),
  address_id uuid not null references public.property_addresses(id),
  address_fingerprint text not null check (address_fingerprint ~ '^[0-9a-f]{64}$'),
  duplicate_review_status text not null default 'clear'
    check (duplicate_review_status in ('clear', 'possible_duplicate', 'reviewed_distinct', 'merged_reference')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by_brokerage_id, address_fingerprint),
  unique (id, created_by_brokerage_id)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id),
  property_id uuid not null references public.properties(id),
  lifecycle_state text not null default 'draft'
    check (lifecycle_state in ('draft', 'pending_initial_approval', 'approved_inactive', 'active', 'under_offer', 'withdrawn', 'sold', 'rented', 'expired', 'unassigned', 'archived')),
  current_approved_version_id uuid,
  current_assignment_id uuid,
  published_at timestamptz,
  unpublished_at timestamptz,
  archived_at timestamptz,
  created_by_person_id uuid not null references public.people(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 1 check (lock_version > 0),
  unique (id, brokerage_id),
  check ((lifecycle_state = 'archived') = (archived_at is not null)),
  check (lifecycle_state <> 'unassigned' or current_assignment_id is null)
);

create table public.listing_assignments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  brokerage_id uuid not null,
  agent_membership_id uuid not null,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'ended', 'invalidated')),
  starts_at timestamptz,
  ends_at timestamptz,
  assigned_by_person_id uuid not null references public.people(id),
  ended_by_person_id uuid references public.people(id),
  reason text check (reason is null or char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (listing_id, brokerage_id) references public.listings(id, brokerage_id),
  foreign key (agent_membership_id, brokerage_id) references public.brokerage_memberships(id, brokerage_id),
  unique (id, listing_id),
  check (
    (status = 'proposed' and starts_at is null and ends_at is null)
    or (status = 'active' and starts_at is not null and ends_at is null)
    or (status in ('ended', 'invalidated') and starts_at is not null and ends_at is not null and ends_at > starts_at)
  )
);

create unique index listing_assignments_one_active_idx
  on public.listing_assignments (listing_id) where status = 'active';

create table public.listing_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  version_number integer not null check (version_number > 0),
  based_on_version_id uuid,
  revision_state text not null default 'working_draft'
    check (revision_state in ('working_draft', 'submitted', 'changes_requested', 'rejected', 'approved', 'withdrawn', 'superseded')),
  submitted_by_person_id uuid references public.people(id),
  submitted_at timestamptz,
  frozen_at timestamptz,
  approved_at timestamptz,
  purpose text not null check (purpose in ('sale', 'long_term_rent')),
  property_type text not null check (property_type in ('residential', 'commercial', 'land', 'development')),
  property_subtype text check (property_subtype is null or char_length(property_subtype) <= 80),
  requested_lifecycle_state text check (requested_lifecycle_state is null or requested_lifecycle_state in ('approved_inactive', 'active', 'under_offer', 'withdrawn', 'sold', 'rented', 'expired', 'archived')),
  currency char(3) not null default 'JMD' check (currency in ('JMD', 'USD')),
  price numeric(14,2) not null check (price > 0),
  price_period text check (price_period is null or price_period in ('month', 'year')),
  title text not null check (char_length(title) between 5 and 160),
  description text not null check (char_length(description) between 20 and 10000),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 100),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms between 0 and 100),
  building_area numeric(14,2) check (building_area is null or building_area > 0),
  land_area numeric(14,2) check (land_area is null or land_area > 0),
  area_unit text check (area_unit is null or area_unit in ('sq_ft', 'sq_m', 'acre', 'hectare')),
  visibility text not null default 'private' check (visibility in ('private', 'professional_network', 'public')),
  public_location_precision text not null default 'area'
    check (public_location_precision in ('exact', 'street', 'area', 'hidden')),
  public_location_label text check (public_location_label is null or char_length(public_location_label) <= 200),
  public_location extensions.geography(Point, 4326),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  changed_fields text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  created_by_person_id uuid not null references public.people(id),
  unique (listing_id, version_number),
  unique (id, listing_id),
  foreign key (based_on_version_id, listing_id) references public.listing_versions(id, listing_id),
  check ((purpose = 'sale' and price_period is null) or (purpose = 'long_term_rent' and price_period is not null)),
  check (
    (revision_state = 'working_draft' and submitted_at is null and frozen_at is null and approved_at is null)
    or (revision_state = 'submitted' and submitted_by_person_id is not null and submitted_at is not null and frozen_at is not null and approved_at is null)
    or (revision_state in ('changes_requested', 'rejected', 'withdrawn') and submitted_by_person_id is not null and submitted_at is not null and frozen_at is not null and approved_at is null)
    or (revision_state in ('approved', 'superseded') and submitted_by_person_id is not null and submitted_at is not null and frozen_at is not null and approved_at is not null)
  )
);

create unique index listing_versions_one_open_proposal_idx
  on public.listing_versions (listing_id)
  where revision_state in ('working_draft', 'submitted');

alter table public.listings
  add constraint listings_current_approved_version_fkey
    foreign key (current_approved_version_id, id)
    references public.listing_versions(id, listing_id)
    deferrable initially deferred,
  add constraint listings_current_assignment_fkey
    foreign key (current_assignment_id, id)
    references public.listing_assignments(id, listing_id)
    deferrable initially deferred;

create table public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_version_id uuid not null unique references public.listing_versions(id),
  reviewer_person_id uuid not null references public.people(id),
  reviewer_membership_id uuid not null references public.brokerage_memberships(id),
  decision text not null check (decision in ('approved', 'changes_requested', 'rejected')),
  comment text check (comment is null or char_length(comment) <= 4000),
  is_self_approval boolean not null default false,
  decided_at timestamptz not null default now(),
  check (decision = 'approved' or nullif(btrim(coalesce(comment, '')), '') is not null)
);

create table public.listing_state_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  listing_id uuid not null references public.listings(id),
  from_state text check (from_state is null or from_state in ('draft', 'pending_initial_approval', 'approved_inactive', 'active', 'under_offer', 'withdrawn', 'sold', 'rented', 'expired', 'unassigned', 'archived')),
  to_state text not null check (to_state in ('draft', 'pending_initial_approval', 'approved_inactive', 'active', 'under_offer', 'withdrawn', 'sold', 'rented', 'expired', 'unassigned', 'archived')),
  source_version_id uuid,
  actor_person_id uuid references public.people(id),
  reason text check (reason is null or char_length(reason) <= 2000),
  occurred_at timestamptz not null default now(),
  check (from_state is null or from_state <> to_state),
  foreign key (source_version_id, listing_id)
    references public.listing_versions(id, listing_id)
);

create index administrative_areas_country_idx on public.administrative_areas (country_id, name);
create index administrative_areas_boundary_idx on public.administrative_areas using gist (boundary);
create index localities_area_idx on public.localities (administrative_area_id, normalized_name);
create index localities_centroid_idx on public.localities using gist (centroid);
create index property_addresses_country_area_idx on public.property_addresses (country_id, administrative_area_id);
create index property_addresses_locality_idx on public.property_addresses (locality_id) where locality_id is not null;
create index property_addresses_location_idx on public.property_addresses using gist (location);
create index properties_address_idx on public.properties (address_id);
create index properties_brokerage_idx on public.properties (created_by_brokerage_id, created_at desc);
create index listings_brokerage_state_idx on public.listings (brokerage_id, lifecycle_state, updated_at desc);
create index listings_property_idx on public.listings (property_id, created_at desc);
create index listings_creator_idx on public.listings (created_by_person_id, created_at desc);
create index listing_assignments_agent_active_idx on public.listing_assignments (agent_membership_id, listing_id) where status = 'active';
create index listing_assignments_brokerage_idx on public.listing_assignments (brokerage_id, status);
create index listing_versions_listing_created_idx on public.listing_versions (listing_id, created_at desc);
create index listing_versions_submitter_idx on public.listing_versions (submitted_by_person_id) where submitted_by_person_id is not null;
create index listing_versions_public_location_idx on public.listing_versions using gist (public_location);
create index listing_reviews_reviewer_idx on public.listing_reviews (reviewer_membership_id, decided_at desc);
create index listing_state_events_listing_idx on public.listing_state_events (listing_id, occurred_at desc);
create index listing_state_events_occurred_brin_idx on public.listing_state_events using brin (occurred_at);

insert into public.administrative_areas (country_id, area_type, code, name)
select country.id, 'parish', parish.code, parish.name
from public.countries as country
cross join (values
  ('JM-01', 'Kingston'), ('JM-02', 'Saint Andrew'), ('JM-03', 'Saint Thomas'),
  ('JM-04', 'Portland'), ('JM-05', 'Saint Mary'), ('JM-06', 'Saint Ann'),
  ('JM-07', 'Trelawny'), ('JM-08', 'Saint James'), ('JM-09', 'Hanover'),
  ('JM-10', 'Westmoreland'), ('JM-11', 'Saint Elizabeth'), ('JM-12', 'Manchester'),
  ('JM-13', 'Clarendon'), ('JM-14', 'Saint Catherine')
) as parish(code, name)
where country.code = 'JM';

alter table public.administrative_areas enable row level security;
alter table public.localities enable row level security;
alter table public.property_addresses enable row level security;
alter table public.properties enable row level security;
alter table public.listings enable row level security;
alter table public.listing_assignments enable row level security;
alter table public.listing_versions enable row level security;
alter table public.listing_reviews enable row level security;
alter table public.listing_state_events enable row level security;

revoke all on public.administrative_areas, public.localities,
  public.property_addresses, public.properties, public.listings,
  public.listing_assignments, public.listing_versions,
  public.listing_reviews, public.listing_state_events
  from anon, authenticated;

create function app_private.validate_active_listing_assignment()
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
      and role.role_key = 'agent'
      and role.starts_at <= now()
      and (role.ends_at is null or role.ends_at > now())
  ) then
    raise exception using errcode = '23514', message = 'Active assignment requires an active agent in the listing brokerage';
  end if;
  return new;
end;
$$;

create function app_private.validate_listing_pointers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_approved_version_id is not null and not exists (
    select 1 from public.listing_versions
    where id = new.current_approved_version_id and listing_id = new.id and revision_state = 'approved'
  ) then
    raise exception using errcode = '23514', message = 'Current approved version must be an approved version of this listing';
  end if;
  if new.current_assignment_id is not null and not exists (
    select 1 from public.listing_assignments
    where id = new.current_assignment_id and listing_id = new.id and status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'Current assignment must be an active assignment of this listing';
  end if;
  if new.lifecycle_state in ('active', 'under_offer')
    and (new.current_approved_version_id is null or new.current_assignment_id is null) then
    raise exception using errcode = '23514', message = 'Public lifecycle requires approved content and an active representative';
  end if;
  return new;
end;
$$;

create function app_private.validate_listing_version_property_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.listings as listing
    join public.properties as property on property.id = listing.property_id
    where listing.id = new.listing_id and property.property_type = new.property_type
  ) then
    raise exception using errcode = '23514', message = 'Version property type must match the property record';
  end if;
  return new;
end;
$$;

create function app_private.protect_listing_version_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'Listing versions are retained and cannot be deleted';
  end if;
  if old.revision_state <> 'working_draft' then
    if not (
      (old.revision_state = 'submitted' and new.revision_state in ('approved', 'changes_requested', 'rejected', 'withdrawn'))
      or (old.revision_state = 'approved' and new.revision_state = 'superseded')
    ) then
      raise exception using errcode = '55000', message = 'This listing version is immutable';
    end if;
    if (to_jsonb(new) - array['revision_state', 'approved_at'])
      is distinct from (to_jsonb(old) - array['revision_state', 'approved_at']) then
      raise exception using errcode = '55000', message = 'Approved or submitted listing content cannot be changed';
    end if;
  end if;
  if old.revision_state = 'submitted'
    and new.revision_state in ('approved', 'changes_requested', 'rejected')
    and not exists (
      select 1 from public.listing_reviews
      where listing_version_id = old.id and decision = new.revision_state
    ) then
    raise exception using errcode = '23514', message = 'A matching review decision is required for this transition';
  end if;
  return new;
end;
$$;

create function app_private.validate_listing_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_brokerage_id uuid;
  submitter_person_id uuid;
begin
  select listing.brokerage_id, version.submitted_by_person_id
  into target_brokerage_id, submitter_person_id
  from public.listing_versions as version
  join public.listings as listing on listing.id = version.listing_id
  where version.id = new.listing_version_id and version.revision_state = 'submitted';

  if target_brokerage_id is null then
    raise exception using errcode = '23514', message = 'Only a submitted listing version can be reviewed';
  end if;
  if not exists (
    select 1
    from public.brokerage_memberships as membership
    where membership.id = new.reviewer_membership_id
      and membership.person_id = new.reviewer_person_id
      and membership.brokerage_id = target_brokerage_id
      and membership.status = 'active'
      and (
        exists (
          select 1 from public.membership_roles as role
          where role.membership_id = membership.id and role.role_key = 'broker'
            and role.starts_at <= now() and (role.ends_at is null or role.ends_at > now())
        )
        or exists (
          select 1 from public.membership_permissions as permission
          where permission.membership_id = membership.id
            and permission.permission_key = 'listing.review' and permission.effect = 'allow'
            and permission.starts_at <= now() and (permission.ends_at is null or permission.ends_at > now())
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Reviewer lacks listing review authority in this brokerage';
  end if;
  if new.is_self_approval is distinct from (new.reviewer_person_id = submitter_person_id) then
    raise exception using errcode = '23514', message = 'Self-approval attribution must match the reviewer and submitter';
  end if;
  return new;
end;
$$;

create trigger validate_active_listing_assignment
  before insert or update on public.listing_assignments
  for each row execute function app_private.validate_active_listing_assignment();
create trigger validate_listing_pointers
  before insert or update on public.listings
  for each row execute function app_private.validate_listing_pointers();
create trigger validate_listing_version_property_type
  before insert or update on public.listing_versions
  for each row execute function app_private.validate_listing_version_property_type();
create trigger protect_listing_version_snapshot
  before update or delete on public.listing_versions
  for each row execute function app_private.protect_listing_version_snapshot();
create trigger validate_listing_review
  before insert on public.listing_reviews
  for each row execute function app_private.validate_listing_review();

revoke all on function app_private.validate_active_listing_assignment() from public, anon, authenticated;
revoke all on function app_private.validate_listing_pointers() from public, anon, authenticated;
revoke all on function app_private.validate_listing_version_property_type() from public, anon, authenticated;
revoke all on function app_private.protect_listing_version_snapshot() from public, anon, authenticated;
revoke all on function app_private.validate_listing_review() from public, anon, authenticated;

create or replace function app_private.process_agent_departure_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  target_membership public.brokerage_memberships%rowtype;
  change_time timestamptz := clock_timestamp();
  actor_effective_role text;
  affected record;
  affected_listing_count integer := 0;
begin
  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into target_membership
  from public.brokerage_memberships
  where id = new.membership_id
  for update;

  if not found or target_membership.status <> 'active' then
    raise exception using errcode = '22023', message = 'Active membership not found';
  end if;
  if target_membership.person_id = actor_person_id then
    raise exception using errcode = '42501', message = 'You cannot end your own brokerage membership';
  end if;
  if not app_private.has_brokerage_permission(target_membership.brokerage_id, 'agent.manage') then
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;
  if not exists (
    select 1 from public.membership_roles
    where membership_id = target_membership.id and role_key = 'agent'
      and starts_at <= now() and (ends_at is null or ends_at > now())
  ) or exists (
    select 1 from public.membership_roles
    where membership_id = target_membership.id and role_key = 'broker'
      and starts_at <= now() and (ends_at is null or ends_at > now())
  ) then
    raise exception using errcode = '22023', message = 'Only a non-broker agent membership can depart';
  end if;

  select case when exists (
    select 1 from public.brokerage_memberships as membership
    join public.membership_roles as role on role.membership_id = membership.id
    where membership.person_id = actor_person_id
      and membership.brokerage_id = target_membership.brokerage_id
      and membership.status = 'active' and role.role_key = 'broker' and role.ends_at is null
  ) then 'broker' else 'broker_staff' end into actor_effective_role;

  for affected in
    select assignment.id as assignment_id, listing.id as listing_id,
      listing.lifecycle_state as prior_state
    from public.listing_assignments as assignment
    join public.listings as listing on listing.id = assignment.listing_id
    where assignment.agent_membership_id = target_membership.id
      and assignment.status = 'active'
    order by listing.id
    for update of listing, assignment
  loop
    update public.listing_assignments
    set status = 'invalidated', ends_at = greatest(change_time, starts_at + interval '1 microsecond'),
        ended_by_person_id = actor_person_id, reason = 'Representative departed brokerage'
    where id = affected.assignment_id;

    update public.listings
    set lifecycle_state = 'unassigned', current_assignment_id = null,
        unpublished_at = case when affected.prior_state in ('active', 'under_offer') then change_time else unpublished_at end,
        updated_at = change_time, lock_version = lock_version + 1
    where id = affected.listing_id;

    insert into public.listing_state_events (
      listing_id, from_state, to_state, actor_person_id, reason, occurred_at
    ) values (
      affected.listing_id, affected.prior_state, 'unassigned', actor_person_id,
      'Representative departed brokerage', change_time
    );
    affected_listing_count := affected_listing_count + 1;
  end loop;

  update public.membership_roles
  set ends_at = greatest(change_time, starts_at + interval '1 microsecond')
  where membership_id = target_membership.id and ends_at is null;
  update public.membership_permissions
  set ends_at = greatest(change_time, starts_at + interval '1 microsecond')
  where membership_id = target_membership.id and ends_at is null;
  update public.brokerage_memberships
  set status = 'departed', ends_at = change_time,
      deactivated_by_person_id = actor_person_id, reason = btrim(new.reason),
      lock_version = lock_version + 1, updated_at = change_time
  where id = target_membership.id;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action,
    target_type, target_id, source, correlation_id, reason,
    before_summary, after_summary
  ) values (
    actor_person_id, actor_effective_role, target_membership.brokerage_id,
    'agent.departed', 'brokerage_membership', target_membership.id,
    'web', gen_random_uuid(), btrim(new.reason),
    jsonb_build_object('status', target_membership.status),
    jsonb_build_object('status', 'departed', 'unassigned_listing_count', affected_listing_count)
  );
  return null;
end;
$$;

revoke all on function app_private.process_agent_departure_command()
  from public, anon, authenticated;

commit;
