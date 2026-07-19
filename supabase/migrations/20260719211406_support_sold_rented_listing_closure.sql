begin;

create table public.request_listing_closure_commands (
  request_id uuid primary key,
  listing_id uuid not null references public.listings(id),
  expected_lock_version integer not null check (expected_lock_version > 0),
  requested_lifecycle_state text not null
    check (requested_lifecycle_state in ('active', 'sold', 'rented'))
);

alter table public.request_listing_closure_commands enable row level security;

create policy request_listing_closure_authenticated_insert
  on public.request_listing_closure_commands
  for insert to authenticated
  with check (app_private.current_person_id() is not null);

create function app_private.process_request_listing_closure_command()
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
  actor_effective_role text;
  changed_at timestamptz := clock_timestamp();
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
    raise exception using errcode = '55000', message = 'Open the active listing for editing before changing its closing outcome';
  end if;
  if target_listing.lock_version <> new.expected_lock_version then
    raise exception using errcode = '40001', message = 'Draft changed since it was opened';
  end if;

  select * into target_version
  from public.listing_versions
  where listing_id = target_listing.id
    and revision_state = 'working_draft'
  order by version_number desc
  limit 1
  for update;

  if not found
    or target_version.based_on_version_id is null
    or target_version.requested_lifecycle_state not in ('active', 'sold', 'rented') then
    raise exception using errcode = '55000', message = 'Only an active listing edit can request a sold or rented outcome';
  end if;

  if target_version.requested_lifecycle_state = new.requested_lifecycle_state then
    return null;
  end if;

  update public.listing_versions
  set requested_lifecycle_state = new.requested_lifecycle_state,
      changed_fields = array(
        select distinct field_name
        from unnest(coalesce(target_version.changed_fields, '{}'::text[]) || array['lifecycle_state']) as field_name
        order by field_name
      ),
      content_hash = encode(extensions.digest(convert_to(jsonb_build_object(
        'purpose', target_version.purpose,
        'property_type', target_version.property_type,
        'property_subtype', target_version.property_subtype,
        'requested_lifecycle_state', new.requested_lifecycle_state,
        'currency', target_version.currency,
        'price', target_version.price,
        'price_period', target_version.price_period,
        'title', target_version.title,
        'description', target_version.description,
        'bedrooms', target_version.bedrooms,
        'bathrooms', target_version.bathrooms,
        'building_area', target_version.building_area,
        'land_area', target_version.land_area,
        'area_unit', target_version.area_unit,
        'visibility', target_version.visibility,
        'public_location_precision', target_version.public_location_precision,
        'public_location_label', target_version.public_location_label
      )::text, 'UTF8'), 'sha256'), 'hex')
  where id = target_version.id;

  update public.listings
  set lock_version = lock_version + 1,
      updated_at = changed_at
  where id = target_listing.id;

  select case when exists (
    select 1 from public.membership_roles
    where membership_id = actor_membership.id and role_key = 'broker'
      and starts_at <= now() and (ends_at is null or ends_at > now())
  ) then 'broker' else 'agent' end into actor_effective_role;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action, target_type,
    target_id, source, correlation_id, before_summary, after_summary,
    occurred_at
  ) values (
    actor_person_id, actor_effective_role, target_listing.brokerage_id,
    'listing.closure_requested', 'listing', target_listing.id, 'web', new.request_id,
    jsonb_build_object('requested_lifecycle_state', target_version.requested_lifecycle_state),
    jsonb_build_object('requested_lifecycle_state', new.requested_lifecycle_state,
      'version_id', target_version.id),
    changed_at
  );

  return null;
end;
$$;

create trigger process_request_listing_closure_command
  before insert on public.request_listing_closure_commands
  for each row execute function app_private.process_request_listing_closure_command();

revoke all on function app_private.process_request_listing_closure_command()
  from public, anon, authenticated;
revoke all on public.request_listing_closure_commands from anon, authenticated;
grant insert on public.request_listing_closure_commands to authenticated;

comment on table public.request_listing_closure_commands is
  'Write-only command boundary for retaining an active listing or requesting a sold or rented outcome in an editable version.';

create function app_private.apply_approved_listing_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_state text;
  closed_at timestamptz := clock_timestamp();
begin
  if new.action <> 'listing.reviewed'
    or new.target_type <> 'listing'
    or new.after_summary ->> 'decision' <> 'approved' then
    return new;
  end if;

  select version.requested_lifecycle_state into requested_state
  from public.listing_versions as version
  where version.id = (new.after_summary ->> 'version_id')::uuid
    and version.listing_id = new.target_id;

  if requested_state not in ('sold', 'rented') then
    return new;
  end if;

  update public.listings
  set lifecycle_state = requested_state,
      published_at = null,
      unpublished_at = coalesce(unpublished_at, closed_at),
      updated_at = closed_at
  where id = new.target_id
    and lifecycle_state = 'approved_inactive';

  if not found then
    return new;
  end if;

  insert into public.listing_state_events (
    listing_id, from_state, to_state, source_version_id, actor_person_id,
    reason, occurred_at
  ) values (
    new.target_id, 'approved_inactive', requested_state,
    (new.after_summary ->> 'version_id')::uuid, new.actor_person_id,
    case requested_state
      when 'sold' then 'Brokerage approved closing the listing as sold'
      else 'Brokerage approved closing the listing as rented'
    end,
    closed_at
  );

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action, target_type,
    target_id, source, correlation_id, reason, before_summary, after_summary,
    occurred_at
  ) values (
    new.actor_person_id, new.effective_role_key, new.brokerage_id,
    'listing.closed', 'listing', new.target_id, 'system', new.event_id,
    case requested_state when 'sold' then 'Approved as sold' else 'Approved as rented' end,
    jsonb_build_object('lifecycle_state', 'approved_inactive'),
    jsonb_build_object('lifecycle_state', requested_state,
      'version_id', new.after_summary ->> 'version_id'),
    closed_at
  );

  return new;
end;
$$;

revoke all on function app_private.apply_approved_listing_closure()
  from public, anon, authenticated;

create trigger apply_approved_listing_closure_from_audit
  after insert on public.audit_events
  for each row execute function app_private.apply_approved_listing_closure();

commit;
