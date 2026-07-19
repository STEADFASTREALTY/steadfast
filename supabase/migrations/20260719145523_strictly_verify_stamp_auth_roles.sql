begin;

do $$
declare
  john_membership_id uuid;
  karen_membership_id uuid;
  matching_count integer;
begin
  if not exists (select 1 from auth.users) then return; end if;

  select count(*), min(membership.id::text)::uuid
  into matching_count, john_membership_id
  from auth.users auth_user
  join public.people person on person.auth_user_id = auth_user.id
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(auth_user.email) = 'johnstamp@canadasap.com'
    and membership.status = 'active';
  if matching_count <> 1 then
    raise exception 'Strict check: expected one active John membership, found %', matching_count;
  end if;

  select count(*), min(membership.id::text)::uuid
  into matching_count, karen_membership_id
  from auth.users auth_user
  join public.people person on person.auth_user_id = auth_user.id
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(auth_user.email) = 'karenwei@canadasap.com'
    and membership.status = 'active';
  if matching_count <> 1 then
    raise exception 'Strict check: expected one active Karen membership, found %', matching_count;
  end if;

  if not exists (
    select 1 from public.membership_roles
    where membership_id = john_membership_id and role_key = 'broker' and ends_at is null
  ) then
    raise exception 'Strict check: John broker role is missing';
  end if;
  if not exists (
    select 1 from public.membership_roles
    where membership_id = karen_membership_id and role_key = 'broker_staff' and ends_at is null
  ) then
    raise exception 'Strict check: Karen staff role is missing';
  end if;
  if not exists (
    select 1 from public.membership_permissions
    where membership_id = karen_membership_id and permission_key = 'agent.manage'
      and effect = 'allow' and ends_at is null
  ) then
    raise exception 'Strict check: Karen agent management permission is missing';
  end if;
end;
$$;

commit;
