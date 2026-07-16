begin;

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2}$'),
  name text not null check (char_length(name) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  account_status text not null default 'active'
    check (account_status in ('invited', 'active', 'locked', 'inactive', 'closed')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  legal_name text check (legal_name is null or char_length(legal_name) between 1 and 200),
  primary_email text,
  primary_phone text,
  locale text not null default 'en-JM' check (char_length(locale) between 2 and 35),
  timezone text not null default 'America/Jamaica' check (char_length(timezone) between 3 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index people_auth_user_id_idx on public.people (auth_user_id)
  where auth_user_id is not null;

create table public.consumer_profiles (
  person_id uuid primary key references public.people(id) on delete cascade,
  marketing_consent_at timestamptz,
  privacy_notice_version text,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professional_profiles (
  person_id uuid primary key references public.people(id) on delete cascade,
  public_slug text unique check (
    public_slug is null or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  bio text check (bio is null or char_length(bio) <= 4000),
  service_areas jsonb not null default '[]'::jsonb check (jsonb_typeof(service_areas) = 'array'),
  license_number text,
  license_status text not null default 'broker_verified'
    check (license_status in ('broker_verified', 'not_provided', 'inactive')),
  public_contact_preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_contact_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_definitions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  scope text not null check (scope in ('consumer', 'brokerage', 'platform')),
  name text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  unique (key, scope)
);

create table public.permission_definitions (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),
  scope text not null check (scope in ('consumer', 'brokerage', 'platform')),
  name text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  created_at timestamptz not null default now(),
  unique (key, scope)
);

create table public.role_permissions (
  role_key text not null references public.role_definitions(key) on delete cascade,
  permission_key text not null references public.permission_definitions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table public.brokerages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  display_name text not null check (char_length(display_name) between 2 and 160),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended_billing', 'inactive', 'closed')),
  country_id uuid not null references public.countries(id),
  primary_office_address jsonb check (
    primary_office_address is null or jsonb_typeof(primary_office_address) = 'object'
  ),
  branding jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  lock_version integer not null default 1 check (lock_version > 0),
  check ((status = 'closed') = (closed_at is not null))
);

create index brokerages_country_status_idx on public.brokerages (country_id, status);

create table public.brokerage_memberships (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id),
  person_id uuid not null references public.people(id),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'inactive', 'declined', 'departed')),
  starts_at timestamptz,
  ends_at timestamptz,
  approved_by_person_id uuid references public.people(id),
  deactivated_by_person_id uuid references public.people(id),
  reason text check (reason is null or char_length(reason) <= 1000),
  lock_version integer not null default 1 check (lock_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brokerage_id),
  check (
    (status = 'active' and starts_at is not null and ends_at is null)
    or (status <> 'active')
  )
);

create unique index brokerage_memberships_one_active_per_person_idx
  on public.brokerage_memberships (person_id)
  where status = 'active';
create index brokerage_memberships_brokerage_status_idx
  on public.brokerage_memberships (brokerage_id, status);
create index brokerage_memberships_person_status_idx
  on public.brokerage_memberships (person_id, status);

create table public.membership_roles (
  membership_id uuid not null,
  brokerage_id uuid not null,
  role_key text not null,
  role_scope text not null default 'brokerage' check (role_scope = 'brokerage'),
  granted_by_person_id uuid references public.people(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (membership_id, role_key, starts_at),
  foreign key (membership_id, brokerage_id)
    references public.brokerage_memberships(id, brokerage_id) on delete cascade,
  foreign key (role_key, role_scope)
    references public.role_definitions(key, scope),
  check (ends_at is null or ends_at > starts_at)
);

create unique index membership_roles_one_active_role_idx
  on public.membership_roles (membership_id, role_key)
  where ends_at is null;
create unique index membership_roles_one_active_broker_idx
  on public.membership_roles (brokerage_id)
  where role_key = 'broker' and ends_at is null;
create index membership_roles_brokerage_role_idx
  on public.membership_roles (brokerage_id, role_key)
  where ends_at is null;

create table public.membership_permissions (
  membership_id uuid not null,
  permission_key text not null,
  permission_scope text not null default 'brokerage' check (permission_scope = 'brokerage'),
  effect text not null check (effect in ('allow', 'deny')),
  granted_by_person_id uuid not null references public.people(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text check (reason is null or char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  primary key (membership_id, permission_key, starts_at),
  foreign key (membership_id) references public.brokerage_memberships(id) on delete cascade,
  foreign key (permission_key, permission_scope)
    references public.permission_definitions(key, scope),
  check (ends_at is null or ends_at > starts_at)
);

create unique index membership_permissions_one_active_idx
  on public.membership_permissions (membership_id, permission_key)
  where ends_at is null;

create table public.person_platform_roles (
  person_id uuid not null references public.people(id),
  role_key text not null,
  role_scope text not null default 'platform' check (role_scope = 'platform'),
  granted_by_person_id uuid references public.people(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (person_id, role_key, starts_at),
  foreign key (role_key, role_scope) references public.role_definitions(key, scope),
  check (ends_at is null or ends_at > starts_at)
);

create unique index person_platform_roles_one_active_idx
  on public.person_platform_roles (person_id, role_key)
  where ends_at is null;

create table public.brokerage_invitations (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references public.brokerages(id),
  email text not null check (char_length(email) between 3 and 320),
  token_digest text not null unique check (char_length(token_digest) between 43 and 128),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  invited_by_person_id uuid not null references public.people(id),
  accepted_by_person_id uuid references public.people(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((status = 'accepted') = (accepted_at is not null))
);

create unique index brokerage_invitations_one_pending_email_idx
  on public.brokerage_invitations (brokerage_id, lower(email))
  where status = 'pending';
create index brokerage_invitations_brokerage_status_idx
  on public.brokerage_invitations (brokerage_id, status, created_at desc);

create table public.brokerage_invitation_roles (
  invitation_id uuid not null references public.brokerage_invitations(id) on delete cascade,
  role_key text not null,
  role_scope text not null default 'brokerage' check (role_scope = 'brokerage'),
  primary key (invitation_id, role_key),
  foreign key (role_key, role_scope) references public.role_definitions(key, scope)
);

create table public.agent_applications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  brokerage_id uuid not null references public.brokerages(id),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'broker_approved', 'broker_denied', 'activated', 'withdrawn')),
  submitted_at timestamptz,
  broker_decided_by uuid references public.people(id),
  broker_decided_at timestamptz,
  broker_reason text check (broker_reason is null or char_length(broker_reason) <= 2000),
  platform_activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'submitted' or submitted_at is not null),
  check (
    status not in ('broker_approved', 'broker_denied', 'activated')
    or (broker_decided_by is not null and broker_decided_at is not null)
  ),
  check (status <> 'activated' or platform_activated_at is not null)
);

create unique index agent_applications_one_open_per_brokerage_idx
  on public.agent_applications (person_id, brokerage_id)
  where status in ('draft', 'submitted', 'broker_approved');
create index agent_applications_brokerage_status_idx
  on public.agent_applications (brokerage_id, status, submitted_at);

create table public.audit_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  actor_person_id uuid references public.people(id),
  effective_role_key text references public.role_definitions(key),
  brokerage_id uuid references public.brokerages(id),
  action text not null check (action ~ '^[a-z][a-z0-9_.]*$'),
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]*$'),
  target_id uuid,
  source text not null check (source in ('web', 'api', 'job', 'system', 'integration')),
  correlation_id uuid not null,
  reason text check (reason is null or char_length(reason) <= 2000),
  before_summary jsonb check (before_summary is null or jsonb_typeof(before_summary) = 'object'),
  after_summary jsonb check (after_summary is null or jsonb_typeof(after_summary) = 'object'),
  occurred_at timestamptz not null default now()
);

create index audit_events_brokerage_occurred_idx
  on public.audit_events (brokerage_id, occurred_at desc);
create index audit_events_target_occurred_idx
  on public.audit_events (target_type, target_id, occurred_at desc);

insert into public.countries (code, name) values ('JM', 'Jamaica');

insert into public.role_definitions (key, scope, name) values
  ('consumer', 'consumer', 'Registered consumer'),
  ('agent', 'brokerage', 'Agent'),
  ('broker_staff', 'brokerage', 'Broker staff'),
  ('broker', 'brokerage', 'Principal broker'),
  ('steadfast_operations', 'platform', 'SteadFast operations'),
  ('steadfast_admin', 'platform', 'SteadFast administrator');

insert into public.permission_definitions (key, scope, name, risk_level) values
  ('listing.create', 'brokerage', 'Create listing drafts', 'medium'),
  ('listing.submit', 'brokerage', 'Submit listing work for approval', 'medium'),
  ('listing.share', 'brokerage', 'Share eligible listings for display', 'medium'),
  ('listing.review', 'brokerage', 'Review and decide listing submissions', 'high'),
  ('listing.manage', 'brokerage', 'Manage brokerage listing workflow', 'high'),
  ('listing.reassign', 'brokerage', 'Reassign brokerage listings', 'high'),
  ('agent.manage', 'brokerage', 'Manage agent applications and memberships', 'high'),
  ('staff.manage_limited', 'brokerage', 'Manage delegated lower-privilege staff', 'critical'),
  ('brokerage.profile', 'brokerage', 'Manage brokerage profile and website', 'high'),
  ('inquiry.manage', 'brokerage', 'Manage authorized brokerage inquiries', 'high'),
  ('report.view', 'brokerage', 'View brokerage operational reports', 'medium'),
  ('audit.view', 'brokerage', 'View brokerage audit history', 'high'),
  ('billing.view', 'brokerage', 'View brokerage billing', 'medium'),
  ('billing.manage', 'brokerage', 'Manage brokerage subscription', 'high'),
  ('integration.manage', 'brokerage', 'Manage authorized distribution channels', 'critical'),
  ('site.agent.manage', 'brokerage', 'Manage own agent website', 'medium'),
  ('inquiry.own.manage', 'brokerage', 'Manage own assigned inquiries', 'medium'),
  ('support.case.manage', 'platform', 'Manage assigned support cases', 'high'),
  ('billing.support', 'platform', 'Service customer billing', 'high'),
  ('flag.manage', 'platform', 'Manage platform flags without listing authority', 'high'),
  ('delivery.manage', 'platform', 'Manage delivery operations', 'high'),
  ('internal_access.manage', 'platform', 'Manage internal access', 'critical'),
  ('platform.configure', 'platform', 'Manage platform configuration', 'critical'),
  ('audit.platform.view', 'platform', 'View platform audit history', 'critical');

insert into public.role_permissions (role_key, permission_key) values
  ('agent', 'listing.create'),
  ('agent', 'listing.submit'),
  ('agent', 'listing.share'),
  ('agent', 'site.agent.manage'),
  ('agent', 'inquiry.own.manage'),
  ('broker', 'listing.create'),
  ('broker', 'listing.submit'),
  ('broker', 'listing.share'),
  ('broker', 'listing.review'),
  ('broker', 'listing.manage'),
  ('broker', 'listing.reassign'),
  ('broker', 'agent.manage'),
  ('broker', 'staff.manage_limited'),
  ('broker', 'brokerage.profile'),
  ('broker', 'inquiry.manage'),
  ('broker', 'report.view'),
  ('broker', 'audit.view'),
  ('broker', 'billing.view'),
  ('broker', 'billing.manage'),
  ('broker', 'integration.manage'),
  ('broker', 'site.agent.manage'),
  ('broker', 'inquiry.own.manage'),
  ('steadfast_operations', 'support.case.manage'),
  ('steadfast_operations', 'billing.support'),
  ('steadfast_operations', 'flag.manage'),
  ('steadfast_operations', 'delivery.manage'),
  ('steadfast_admin', 'support.case.manage'),
  ('steadfast_admin', 'billing.support'),
  ('steadfast_admin', 'flag.manage'),
  ('steadfast_admin', 'delivery.manage'),
  ('steadfast_admin', 'internal_access.manage'),
  ('steadfast_admin', 'platform.configure'),
  ('steadfast_admin', 'audit.platform.view');

create function app_private.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select person.id
  from public.people as person
  where person.auth_user_id = (select auth.uid())
    and person.account_status = 'active'
  limit 1
$$;

create function app_private.is_active_brokerage_member(target_brokerage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.brokerage_memberships as membership
    where membership.brokerage_id = target_brokerage_id
      and membership.person_id = app_private.current_person_id()
      and membership.status = 'active'
  )
$$;

create function app_private.has_brokerage_permission(
  target_brokerage_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with active_membership as (
    select membership.id
    from public.brokerage_memberships as membership
    where membership.brokerage_id = target_brokerage_id
      and membership.person_id = app_private.current_person_id()
      and membership.status = 'active'
    limit 1
  ), active_roles as (
    select role.role_key
    from public.membership_roles as role
    join active_membership on active_membership.id = role.membership_id
    where role.starts_at <= now()
      and (role.ends_at is null or role.ends_at > now())
  ), explicit_permission as (
    select permission.effect
    from public.membership_permissions as permission
    join active_membership on active_membership.id = permission.membership_id
    where permission.permission_key = target_permission_key
      and permission.starts_at <= now()
      and (permission.ends_at is null or permission.ends_at > now())
    limit 1
  )
  select case
    when exists (select 1 from active_roles where role_key = 'broker') then true
    when (select effect from explicit_permission) = 'deny' then false
    when (select effect from explicit_permission) = 'allow' then true
    else exists (
      select 1
      from active_roles
      join public.role_permissions as role_permission
        on role_permission.role_key = active_roles.role_key
      where role_permission.permission_key = target_permission_key
    )
  end
$$;

create function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.people (auth_user_id, display_name, primary_email)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'New user'
      ),
      120
    ),
    nullif(lower(btrim(coalesce(new.email, ''))), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_auth_user();

create function app_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger people_touch_updated_at before update on public.people
  for each row execute function app_private.touch_updated_at();
create trigger consumer_profiles_touch_updated_at before update on public.consumer_profiles
  for each row execute function app_private.touch_updated_at();
create trigger professional_profiles_touch_updated_at before update on public.professional_profiles
  for each row execute function app_private.touch_updated_at();
create trigger brokerages_touch_updated_at before update on public.brokerages
  for each row execute function app_private.touch_updated_at();
create trigger brokerage_memberships_touch_updated_at before update on public.brokerage_memberships
  for each row execute function app_private.touch_updated_at();
create trigger brokerage_invitations_touch_updated_at before update on public.brokerage_invitations
  for each row execute function app_private.touch_updated_at();
create trigger agent_applications_touch_updated_at before update on public.agent_applications
  for each row execute function app_private.touch_updated_at();

revoke all on function app_private.current_person_id() from public, anon;
revoke all on function app_private.is_active_brokerage_member(uuid) from public, anon;
revoke all on function app_private.has_brokerage_permission(uuid, text) from public, anon;
revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;
grant execute on function app_private.current_person_id() to authenticated;
grant execute on function app_private.is_active_brokerage_member(uuid) to authenticated;
grant execute on function app_private.has_brokerage_permission(uuid, text) to authenticated;

alter table public.countries enable row level security;
alter table public.people enable row level security;
alter table public.consumer_profiles enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.role_definitions enable row level security;
alter table public.permission_definitions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.brokerages enable row level security;
alter table public.brokerage_memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.membership_permissions enable row level security;
alter table public.person_platform_roles enable row level security;
alter table public.brokerage_invitations enable row level security;
alter table public.brokerage_invitation_roles enable row level security;
alter table public.agent_applications enable row level security;
alter table public.audit_events enable row level security;

create policy countries_public_read on public.countries
  for select to anon, authenticated using (is_active);

create policy people_read_self on public.people
  for select to authenticated
  using (id = app_private.current_person_id());
create policy people_update_self on public.people
  for update to authenticated
  using (id = app_private.current_person_id())
  with check (id = app_private.current_person_id() and account_status = 'active');

create policy consumer_profiles_manage_self on public.consumer_profiles
  for all to authenticated
  using (person_id = app_private.current_person_id())
  with check (person_id = app_private.current_person_id());

create policy professional_profiles_read_self_or_brokerage on public.professional_profiles
  for select to authenticated
  using (
    person_id = app_private.current_person_id()
    or exists (
      select 1
      from public.brokerage_memberships as target_membership
      join public.brokerage_memberships as caller_membership
        on caller_membership.brokerage_id = target_membership.brokerage_id
      where target_membership.person_id = professional_profiles.person_id
        and target_membership.status = 'active'
        and caller_membership.person_id = app_private.current_person_id()
        and caller_membership.status = 'active'
    )
  );
create policy professional_profiles_insert_self on public.professional_profiles
  for insert to authenticated
  with check (person_id = app_private.current_person_id());
create policy professional_profiles_update_self on public.professional_profiles
  for update to authenticated
  using (person_id = app_private.current_person_id())
  with check (person_id = app_private.current_person_id());

create policy authorization_catalog_authenticated_read on public.role_definitions
  for select to authenticated using (true);
create policy permission_catalog_authenticated_read on public.permission_definitions
  for select to authenticated using (true);
create policy role_permissions_authenticated_read on public.role_permissions
  for select to authenticated using (true);

create policy brokerages_public_directory on public.brokerages
  for select to anon using (status = 'active');
create policy brokerages_member_read on public.brokerages
  for select to authenticated
  using (status = 'active' or app_private.is_active_brokerage_member(id));
create policy brokerages_authorized_update on public.brokerages
  for update to authenticated
  using (app_private.has_brokerage_permission(id, 'brokerage.profile'))
  with check (app_private.has_brokerage_permission(id, 'brokerage.profile'));

create policy memberships_read_self_or_authorized on public.brokerage_memberships
  for select to authenticated
  using (
    person_id = app_private.current_person_id()
    or app_private.has_brokerage_permission(brokerage_id, 'agent.manage')
  );

create policy membership_roles_read_self_or_authorized on public.membership_roles
  for select to authenticated
  using (
    exists (
      select 1 from public.brokerage_memberships as membership
      where membership.id = membership_roles.membership_id
        and membership.person_id = app_private.current_person_id()
    )
    or app_private.has_brokerage_permission(brokerage_id, 'agent.manage')
  );

create policy membership_permissions_read_self_or_broker on public.membership_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.brokerage_memberships as membership
      where membership.id = membership_permissions.membership_id
        and membership.person_id = app_private.current_person_id()
    )
    or exists (
      select 1 from public.brokerage_memberships as target
      where target.id = membership_permissions.membership_id
        and app_private.has_brokerage_permission(target.brokerage_id, 'staff.manage_limited')
    )
  );

create policy platform_roles_read_self on public.person_platform_roles
  for select to authenticated
  using (person_id = app_private.current_person_id());

create policy invitations_authorized_read on public.brokerage_invitations
  for select to authenticated
  using (app_private.has_brokerage_permission(brokerage_id, 'staff.manage_limited'));
create policy invitation_roles_authorized_read on public.brokerage_invitation_roles
  for select to authenticated
  using (
    exists (
      select 1 from public.brokerage_invitations as invitation
      where invitation.id = brokerage_invitation_roles.invitation_id
        and app_private.has_brokerage_permission(invitation.brokerage_id, 'staff.manage_limited')
    )
  );

create policy agent_applications_read_own_or_authorized on public.agent_applications
  for select to authenticated
  using (
    person_id = app_private.current_person_id()
    or app_private.has_brokerage_permission(brokerage_id, 'agent.manage')
  );

create policy audit_events_brokerage_read on public.audit_events
  for select to authenticated
  using (
    brokerage_id is not null
    and app_private.has_brokerage_permission(brokerage_id, 'audit.view')
  );

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.countries to anon, authenticated;
grant select (id, slug, display_name, status, country_id)
  on public.brokerages to anon;
grant select on public.people, public.consumer_profiles, public.professional_profiles,
  public.role_definitions, public.permission_definitions, public.role_permissions,
  public.brokerages, public.brokerage_memberships, public.membership_roles,
  public.membership_permissions, public.person_platform_roles,
  public.agent_applications, public.audit_events
  to authenticated;
grant select (id, brokerage_id, email, status, invited_by_person_id,
  accepted_by_person_id, expires_at, accepted_at, revoked_at, created_at, updated_at)
  on public.brokerage_invitations to authenticated;
grant select on public.brokerage_invitation_roles to authenticated;

grant update (display_name, legal_name, primary_email, primary_phone, locale, timezone)
  on public.people to authenticated;
grant insert, update, delete on public.consumer_profiles to authenticated;
grant insert, update on public.professional_profiles to authenticated;
grant update (display_name, primary_office_address, branding, lock_version)
  on public.brokerages to authenticated;

comment on function app_private.current_person_id() is
  'Returns the active application person for the authenticated Supabase user.';
comment on function app_private.has_brokerage_permission(uuid, text) is
  'Resolves active brokerage roles and explicit staff permission grants. Broker is authoritative.';
comment on table public.brokerage_invitations is
  'Invitation metadata. Token digests are server-only and never granted to Data API roles.';
comment on table public.audit_events is
  'Append-only business audit history. Data API roles receive no insert, update, or delete privileges.';

commit;
