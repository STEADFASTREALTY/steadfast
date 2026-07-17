begin;

create table public.agent_departure_commands (
  membership_id uuid not null references public.brokerage_memberships(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000)
);

alter table public.agent_departure_commands enable row level security;

create policy agent_departure_command_authenticated_insert
  on public.agent_departure_commands
  for insert to authenticated
  with check (app_private.current_person_id() is not null);

create function app_private.process_agent_departure_command()
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
    where membership_id = target_membership.id
      and role_key = 'agent'
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
  ) or exists (
    select 1 from public.membership_roles
    where membership_id = target_membership.id
      and role_key = 'broker'
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
  ) then
    raise exception using errcode = '22023', message = 'Only a non-broker agent membership can depart';
  end if;

  select case when exists (
    select 1
    from public.brokerage_memberships as membership
    join public.membership_roles as role on role.membership_id = membership.id
    where membership.person_id = actor_person_id
      and membership.brokerage_id = target_membership.brokerage_id
      and membership.status = 'active'
      and role.role_key = 'broker'
      and role.ends_at is null
  ) then 'broker' else 'broker_staff' end into actor_effective_role;

  update public.membership_roles
  set ends_at = greatest(change_time, starts_at + interval '1 microsecond')
  where membership_id = target_membership.id and ends_at is null;

  update public.membership_permissions
  set ends_at = greatest(change_time, starts_at + interval '1 microsecond')
  where membership_id = target_membership.id and ends_at is null;

  update public.brokerage_memberships
  set status = 'departed',
      ends_at = change_time,
      deactivated_by_person_id = actor_person_id,
      reason = btrim(new.reason),
      lock_version = lock_version + 1,
      updated_at = change_time
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
    jsonb_build_object('status', 'departed', 'unassigned_listing_count', 0)
  );

  return null;
end;
$$;

create trigger process_agent_departure_command
  before insert on public.agent_departure_commands
  for each row execute function app_private.process_agent_departure_command();

revoke all on function app_private.process_agent_departure_command()
  from public, anon, authenticated;
revoke all on public.agent_departure_commands from anon, authenticated;
grant insert on public.agent_departure_commands to authenticated;

comment on table public.agent_departure_commands is
  'Write-only audited agent departure boundary; rows are never persisted.';

commit;
