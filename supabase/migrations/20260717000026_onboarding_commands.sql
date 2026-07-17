begin;

-- These command tables are write-only Data API boundaries. Their BEFORE INSERT
-- triggers perform one validated transaction and return null, so command payloads
-- and invitation token digests are never persisted in the command tables.
create table public.agent_application_commands (
  brokerage_id uuid not null references public.brokerages(id)
);

create table public.agent_application_decision_commands (
  application_id uuid not null references public.agent_applications(id),
  decision text not null check (decision in ('approve', 'deny')),
  reason text check (reason is null or char_length(reason) <= 2000)
);

create table public.brokerage_invitation_commands (
  brokerage_id uuid not null references public.brokerages(id),
  email text not null check (char_length(email) between 3 and 320),
  token_digest text not null check (char_length(token_digest) between 43 and 128),
  role_keys text[] not null check (cardinality(role_keys) between 1 and 2),
  expires_at timestamptz not null
);

create table public.brokerage_invitation_acceptance_commands (
  token_digest text not null check (char_length(token_digest) between 43 and 128)
);

alter table public.agent_application_commands enable row level security;
alter table public.agent_application_decision_commands enable row level security;
alter table public.brokerage_invitation_commands enable row level security;
alter table public.brokerage_invitation_acceptance_commands enable row level security;

drop policy people_read_self on public.people;
create policy people_read_self_or_authorized_brokerage on public.people
  for select to authenticated
  using (
    id = app_private.current_person_id()
    or exists (
      select 1
      from public.agent_applications as application
      where application.person_id = people.id
        and app_private.has_brokerage_permission(
          application.brokerage_id,
          'agent.manage'
        )
    )
    or exists (
      select 1
      from public.brokerage_memberships as membership
      where membership.person_id = people.id
        and membership.status = 'active'
        and app_private.has_brokerage_permission(
          membership.brokerage_id,
          'agent.manage'
        )
    )
  );

create policy agent_application_command_authenticated_insert
  on public.agent_application_commands
  for insert to authenticated
  with check (app_private.current_person_id() is not null);

create policy agent_application_decision_authorized_insert
  on public.agent_application_decision_commands
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.agent_applications as application
      where application.id = application_id
        and app_private.has_brokerage_permission(
          application.brokerage_id,
          'agent.manage'
        )
    )
  );

create policy brokerage_invitation_command_authorized_insert
  on public.brokerage_invitation_commands
  for insert to authenticated
  with check (
    app_private.has_brokerage_permission(
      brokerage_id,
      'staff.manage_limited'
    )
  );

create policy brokerage_invitation_acceptance_authenticated_insert
  on public.brokerage_invitation_acceptance_commands
  for insert to authenticated
  with check (app_private.current_person_id() is not null);

create function app_private.process_agent_application_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  new_application_id uuid;
begin
  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1 from public.brokerages
    where id = new.brokerage_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Brokerage is not accepting applications';
  end if;

  if exists (
    select 1 from public.brokerage_memberships
    where person_id = actor_person_id and status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'An active brokerage membership already exists';
  end if;

  insert into public.agent_applications (
    person_id, brokerage_id, status, submitted_at
  ) values (
    actor_person_id, new.brokerage_id, 'submitted', now()
  ) returning id into new_application_id;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action,
    target_type, target_id, source, correlation_id, after_summary
  ) values (
    actor_person_id, 'consumer', new.brokerage_id, 'agent_application.submitted',
    'agent_application', new_application_id, 'web', gen_random_uuid(),
    jsonb_build_object('status', 'submitted')
  );

  return null;
end;
$$;

create function app_private.process_agent_application_decision_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  target_application public.agent_applications%rowtype;
  new_membership_id uuid;
  actor_effective_role text;
begin
  actor_person_id := app_private.current_person_id();

  select * into target_application
  from public.agent_applications
  where id = new.application_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Application not found';
  end if;

  if actor_person_id is null or not app_private.has_brokerage_permission(
    target_application.brokerage_id,
    'agent.manage'
  ) then
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;

  select case when exists (
    select 1
    from public.brokerage_memberships as membership
    join public.membership_roles as role on role.membership_id = membership.id
    where membership.person_id = actor_person_id
      and membership.brokerage_id = target_application.brokerage_id
      and membership.status = 'active'
      and role.role_key = 'broker'
      and role.ends_at is null
  ) then 'broker' else 'broker_staff' end
  into actor_effective_role;

  if target_application.status <> 'submitted' then
    raise exception using errcode = '22023', message = 'Application is not awaiting a decision';
  end if;

  if new.decision = 'deny' and nullif(btrim(coalesce(new.reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A reason is required when declining an application';
  end if;

  if new.decision = 'approve' then
    if exists (
      select 1 from public.brokerage_memberships
      where person_id = target_application.person_id and status = 'active'
    ) then
      raise exception using errcode = '23505', message = 'Applicant already has an active brokerage membership';
    end if;

    insert into public.brokerage_memberships (
      brokerage_id, person_id, status, starts_at, approved_by_person_id,
      reason
    ) values (
      target_application.brokerage_id, target_application.person_id,
      'active', now(), actor_person_id, 'Approved agent application'
    ) returning id into new_membership_id;

    insert into public.membership_roles (
      membership_id, brokerage_id, role_key, granted_by_person_id
    ) values (
      new_membership_id, target_application.brokerage_id, 'agent', actor_person_id
    );

    update public.agent_applications
    set status = 'activated',
        broker_decided_by = actor_person_id,
        broker_decided_at = now(),
        broker_reason = nullif(btrim(coalesce(new.reason, '')), ''),
        platform_activated_at = now()
    where id = target_application.id;

    insert into public.audit_events (
      actor_person_id, effective_role_key, brokerage_id, action,
      target_type, target_id, source, correlation_id, reason,
      before_summary, after_summary
    ) values (
      actor_person_id, actor_effective_role, target_application.brokerage_id,
      'agent_application.approved', 'agent_application', target_application.id,
      'web', gen_random_uuid(), nullif(btrim(coalesce(new.reason, '')), ''),
      jsonb_build_object('status', target_application.status),
      jsonb_build_object('status', 'activated', 'membership_id', new_membership_id)
    );
  else
    update public.agent_applications
    set status = 'broker_denied',
        broker_decided_by = actor_person_id,
        broker_decided_at = now(),
        broker_reason = btrim(new.reason)
    where id = target_application.id;

    insert into public.audit_events (
      actor_person_id, effective_role_key, brokerage_id, action,
      target_type, target_id, source, correlation_id, reason,
      before_summary, after_summary
    ) values (
      actor_person_id, actor_effective_role, target_application.brokerage_id,
      'agent_application.denied', 'agent_application', target_application.id,
      'web', gen_random_uuid(), btrim(new.reason),
      jsonb_build_object('status', target_application.status),
      jsonb_build_object('status', 'broker_denied')
    );
  end if;

  return null;
end;
$$;

create function app_private.process_brokerage_invitation_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  new_invitation_id uuid;
  normalized_email text;
  requested_role text;
  actor_effective_role text;
begin
  actor_person_id := app_private.current_person_id();
  if actor_person_id is null or not app_private.has_brokerage_permission(
    new.brokerage_id,
    'staff.manage_limited'
  ) then
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;

  select case when exists (
    select 1
    from public.brokerage_memberships as membership
    join public.membership_roles as role on role.membership_id = membership.id
    where membership.person_id = actor_person_id
      and membership.brokerage_id = new.brokerage_id
      and membership.status = 'active'
      and role.role_key = 'broker'
      and role.ends_at is null
  ) then 'broker' else 'broker_staff' end
  into actor_effective_role;

  normalized_email := lower(btrim(new.email));
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'A valid email address is required';
  end if;

  if new.expires_at <= now() or new.expires_at > now() + interval '14 days' then
    raise exception using errcode = '22023', message = 'Invitation expiry is invalid';
  end if;

  if new.role_keys <@ array['agent', 'broker_staff']::text[] is not true
     or cardinality(array(select distinct unnest(new.role_keys))) <> cardinality(new.role_keys) then
    raise exception using errcode = '22023', message = 'Invitation roles are invalid';
  end if;

  insert into public.brokerage_invitations (
    brokerage_id, email, token_digest, invited_by_person_id, expires_at
  ) values (
    new.brokerage_id, normalized_email, new.token_digest,
    actor_person_id, new.expires_at
  ) returning id into new_invitation_id;

  foreach requested_role in array new.role_keys loop
    insert into public.brokerage_invitation_roles (invitation_id, role_key)
    values (new_invitation_id, requested_role);
  end loop;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action,
    target_type, target_id, source, correlation_id, after_summary
  ) values (
    actor_person_id, actor_effective_role, new.brokerage_id, 'brokerage_invitation.created',
    'brokerage_invitation', new_invitation_id, 'web', gen_random_uuid(),
    jsonb_build_object('email', normalized_email, 'roles', new.role_keys)
  );

  return null;
end;
$$;

create function app_private.process_brokerage_invitation_acceptance_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person public.people%rowtype;
  target_invitation public.brokerage_invitations%rowtype;
  new_membership_id uuid;
  requested_role record;
begin
  select * into actor_person
  from public.people
  where id = app_private.current_person_id();

  if not found then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into target_invitation
  from public.brokerage_invitations
  where token_digest = new.token_digest
  for update;

  if not found or target_invitation.status <> 'pending' or target_invitation.expires_at <= now() then
    raise exception using errcode = '22023', message = 'Invitation is invalid or expired';
  end if;

  if lower(coalesce(actor_person.primary_email, '')) <> lower(target_invitation.email) then
    raise exception using errcode = '42501', message = 'Invitation email does not match the signed-in account';
  end if;

  if exists (
    select 1 from public.brokerage_memberships
    where person_id = actor_person.id and status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'An active brokerage membership already exists';
  end if;

  insert into public.brokerage_memberships (
    brokerage_id, person_id, status, starts_at, approved_by_person_id,
    reason
  ) values (
    target_invitation.brokerage_id, actor_person.id, 'active', now(),
    target_invitation.invited_by_person_id, 'Accepted brokerage invitation'
  ) returning id into new_membership_id;

  for requested_role in
    select role_key
    from public.brokerage_invitation_roles
    where invitation_id = target_invitation.id
  loop
    insert into public.membership_roles (
      membership_id, brokerage_id, role_key, granted_by_person_id
    ) values (
      new_membership_id, target_invitation.brokerage_id,
      requested_role.role_key, target_invitation.invited_by_person_id
    );
  end loop;

  update public.brokerage_invitations
  set status = 'accepted', accepted_by_person_id = actor_person.id,
      accepted_at = now()
  where id = target_invitation.id;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action,
    target_type, target_id, source, correlation_id, after_summary
  ) values (
    actor_person.id, null, target_invitation.brokerage_id,
    'brokerage_invitation.accepted', 'brokerage_invitation',
    target_invitation.id, 'web', gen_random_uuid(),
    jsonb_build_object('membership_id', new_membership_id)
  );

  return null;
end;
$$;

create trigger process_agent_application_command
  before insert on public.agent_application_commands
  for each row execute function app_private.process_agent_application_command();
create trigger process_agent_application_decision_command
  before insert on public.agent_application_decision_commands
  for each row execute function app_private.process_agent_application_decision_command();
create trigger process_brokerage_invitation_command
  before insert on public.brokerage_invitation_commands
  for each row execute function app_private.process_brokerage_invitation_command();
create trigger process_brokerage_invitation_acceptance_command
  before insert on public.brokerage_invitation_acceptance_commands
  for each row execute function app_private.process_brokerage_invitation_acceptance_command();

revoke all on function app_private.process_agent_application_command()
  from public, anon, authenticated;
revoke all on function app_private.process_agent_application_decision_command()
  from public, anon, authenticated;
revoke all on function app_private.process_brokerage_invitation_command()
  from public, anon, authenticated;
revoke all on function app_private.process_brokerage_invitation_acceptance_command()
  from public, anon, authenticated;

revoke all on public.agent_application_commands,
  public.agent_application_decision_commands,
  public.brokerage_invitation_commands,
  public.brokerage_invitation_acceptance_commands
  from anon, authenticated;
grant insert on public.agent_application_commands,
  public.agent_application_decision_commands,
  public.brokerage_invitation_commands,
  public.brokerage_invitation_acceptance_commands
  to authenticated;

comment on table public.agent_application_commands is
  'Write-only transactional command boundary; rows are never persisted.';
comment on table public.brokerage_invitation_commands is
  'Write-only transactional command boundary; token digests are handled atomically and rows are never persisted.';

commit;
