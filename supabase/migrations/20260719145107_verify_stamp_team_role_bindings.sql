begin;

do $$
declare
  john_person_id uuid;
  john_membership_id uuid;
  john_brokerage_id uuid;
  karen_person_id uuid;
  karen_membership_id uuid;
  matching_count integer;
begin
  select count(*), min(person.id::text)::uuid,
    min(membership.id::text)::uuid, min(membership.brokerage_id::text)::uuid
  into matching_count, john_person_id, john_membership_id, john_brokerage_id
  from public.people person
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(btrim(person.primary_email)) = 'johnstamp@canadasap.com'
    and person.auth_user_id is not null and membership.status = 'active';
  if matching_count = 0 and not exists (
    select 1 from public.people person
    where lower(btrim(person.primary_email)) = 'karenwei@canadasap.com'
      and person.auth_user_id is not null
  ) then
    return;
  end if;
  if matching_count <> 1 then
    raise exception 'Expected one linked active John Stamp membership, found %', matching_count;
  end if;

  select count(*), min(person.id::text)::uuid, min(membership.id::text)::uuid
  into matching_count, karen_person_id, karen_membership_id
  from public.people person
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(btrim(person.primary_email)) = 'karenwei@canadasap.com'
    and person.auth_user_id is not null and membership.status = 'active';
  if matching_count <> 1 then
    raise exception 'Expected one linked active Karen Wei membership, found %', matching_count;
  end if;

  update public.membership_roles
  set ends_at = greatest(clock_timestamp(), starts_at + interval '1 microsecond')
  where brokerage_id = john_brokerage_id and role_key = 'broker'
    and ends_at is null and membership_id <> john_membership_id;

  if not exists (
    select 1 from public.membership_roles
    where membership_id = john_membership_id and role_key = 'broker' and ends_at is null
  ) then
    insert into public.membership_roles (
      membership_id, brokerage_id, role_key, granted_by_person_id
    ) values (john_membership_id, john_brokerage_id, 'broker', john_person_id);
  end if;

  if not exists (
    select 1 from public.membership_roles
    where membership_id = karen_membership_id and role_key = 'broker_staff' and ends_at is null
  ) then
    insert into public.membership_roles (
      membership_id, brokerage_id, role_key, granted_by_person_id
    ) values (karen_membership_id, john_brokerage_id, 'broker_staff', john_person_id);
  end if;

  insert into public.membership_permissions (
    membership_id, permission_key, effect, granted_by_person_id, reason
  )
  select karen_membership_id, requested.permission_key, 'allow', john_person_id,
    'Recorded demonstration staff access'
  from (values ('listing.review'), ('listing.manage'), ('agent.manage'),
    ('inquiry.manage'), ('audit.view')) requested(permission_key)
  where not exists (
    select 1 from public.membership_permissions permission
    where permission.membership_id = karen_membership_id
      and permission.permission_key = requested.permission_key and permission.ends_at is null
  );

  if not exists (
    select 1 from public.membership_roles
    where membership_id = john_membership_id and role_key = 'broker' and ends_at is null
  ) or not exists (
    select 1 from public.membership_roles
    where membership_id = karen_membership_id and role_key = 'broker_staff' and ends_at is null
  ) or not exists (
    select 1 from public.membership_permissions
    where membership_id = karen_membership_id and permission_key = 'agent.manage'
      and effect = 'allow' and ends_at is null
  ) then
    raise exception 'Stamp team role verification failed';
  end if;
end;
$$;

commit;
