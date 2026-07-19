begin;

create table public.start_listing_edit_commands (
  request_id uuid primary key,
  listing_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.start_listing_edit_commands enable row level security;

create policy start_listing_edit_authenticated_insert
  on public.start_listing_edit_commands for insert to authenticated
  with check ((select auth.uid()) is not null);

create function app_private.process_start_listing_edit_command()
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
  editable_version_id uuid;
  edit_started_at timestamptz := clock_timestamp();
  actor_effective_role text;
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
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;

  select * into actor_membership
  from public.brokerage_memberships
  where person_id = actor_person_id
    and brokerage_id = target_listing.brokerage_id
    and status = 'active'
  limit 1;
  if not found or not (
    target_listing.created_by_person_id = actor_person_id
    or app_private.has_brokerage_permission(target_listing.brokerage_id, 'listing.manage')
  ) then
    raise exception using errcode = '42501', message = 'Listing edit authority is required';
  end if;

  if target_listing.lifecycle_state not in ('active', 'under_offer')
    or target_listing.current_approved_version_id is null then
    raise exception using errcode = '55000', message = 'Only an active approved listing can be edited';
  end if;

  if exists (
    select 1 from public.listing_versions
    where listing_id = target_listing.id
      and revision_state in ('working_draft', 'submitted')
  ) then
    raise exception using errcode = '55000', message = 'This listing already has an edit in progress';
  end if;

  select * into approved_version
  from public.listing_versions
  where id = target_listing.current_approved_version_id
    and listing_id = target_listing.id
    and revision_state = 'approved';
  if not found then
    raise exception using errcode = '55000', message = 'The approved listing details are unavailable';
  end if;

  insert into public.listing_versions (
    listing_id, version_number, based_on_version_id, purpose, property_type,
    property_subtype, requested_lifecycle_state, currency, price, price_period,
    title, description, bedrooms, bathrooms, building_area, land_area,
    area_unit, visibility, public_location_precision, public_location_label,
    public_location, attributes, content_hash, changed_fields,
    created_by_person_id
  ) values (
    target_listing.id,
    (select coalesce(max(version_number), 0) + 1 from public.listing_versions where listing_id = target_listing.id),
    approved_version.id, approved_version.purpose, approved_version.property_type,
    approved_version.property_subtype, 'active', approved_version.currency,
    approved_version.price, approved_version.price_period, approved_version.title,
    approved_version.description, approved_version.bedrooms, approved_version.bathrooms,
    approved_version.building_area, approved_version.land_area, approved_version.area_unit,
    approved_version.visibility, approved_version.public_location_precision,
    approved_version.public_location_label, approved_version.public_location,
    approved_version.attributes, approved_version.content_hash, '{}'::text[],
    actor_person_id
  ) returning id into editable_version_id;

  insert into public.listing_version_media (
    listing_version_id, listing_id, media_id, position, caption
  )
  select editable_version_id, listing_id, media_id, position, caption
  from public.listing_version_media
  where listing_version_id = approved_version.id;

  update public.listings
  set lifecycle_state = 'draft',
      published_at = null,
      lock_version = lock_version + 1,
      updated_at = edit_started_at
  where id = target_listing.id;

  insert into public.listing_state_events (
    listing_id, from_state, to_state, source_version_id, actor_person_id,
    reason, occurred_at
  ) values (
    target_listing.id, target_listing.lifecycle_state, 'draft', editable_version_id,
    actor_person_id, 'Active listing opened for direct editing', edit_started_at
  );

  select case when exists (
    select 1 from public.membership_roles
    where membership_id = actor_membership.id and role_key = 'broker'
      and starts_at <= now() and (ends_at is null or ends_at > now())
  ) then 'broker' else 'agent' end into actor_effective_role;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action, target_type,
    target_id, source, correlation_id, before_summary, after_summary, occurred_at
  ) values (
    actor_person_id, actor_effective_role, target_listing.brokerage_id,
    'listing.edit_started', 'listing', target_listing.id, 'web', new.request_id,
    jsonb_build_object('lifecycle_state', target_listing.lifecycle_state,
      'approved_version_id', approved_version.id),
    jsonb_build_object('lifecycle_state', 'draft',
      'editable_version_id', editable_version_id),
    edit_started_at
  );

  return null;
end;
$$;

create trigger process_start_listing_edit_command
  before insert on public.start_listing_edit_commands
  for each row execute function app_private.process_start_listing_edit_command();

revoke all on function app_private.process_start_listing_edit_command()
  from public, anon, authenticated;
revoke all on public.start_listing_edit_commands from anon, authenticated;
grant insert on public.start_listing_edit_commands to authenticated;

comment on table public.start_listing_edit_commands is
  'Write-only command boundary that opens the existing active listing for direct editing and removes it from public display.';

commit;
