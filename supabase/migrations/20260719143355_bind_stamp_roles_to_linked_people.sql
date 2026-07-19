begin;

with john as (
  select membership.id as membership_id, membership.brokerage_id, person.id as person_id
  from public.people person
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(person.primary_email) = 'johnstamp@canadasap.com'
    and person.auth_user_id is not null and membership.status = 'active'
)
update public.membership_roles role
set ends_at = greatest(clock_timestamp(), role.starts_at + interval '1 microsecond')
from john
where role.brokerage_id = john.brokerage_id and role.role_key = 'broker'
  and role.ends_at is null and role.membership_id <> john.membership_id;

with john as (
  select membership.id as membership_id, membership.brokerage_id, person.id as person_id
  from public.people person
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(person.primary_email) = 'johnstamp@canadasap.com'
    and person.auth_user_id is not null and membership.status = 'active'
)
insert into public.membership_roles (membership_id, brokerage_id, role_key, granted_by_person_id)
select john.membership_id, john.brokerage_id, 'broker', john.person_id from john
where not exists (
  select 1 from public.membership_roles role where role.membership_id = john.membership_id
    and role.role_key = 'broker' and role.ends_at is null
);

with team as (
  select karen_membership.id as membership_id, karen_membership.brokerage_id,
    john.id as granted_by_person_id
  from public.people karen
  join public.brokerage_memberships karen_membership on karen_membership.person_id = karen.id
  join public.people john on lower(john.primary_email) = 'johnstamp@canadasap.com'
    and john.auth_user_id is not null
  where lower(karen.primary_email) = 'karenwei@canadasap.com'
    and karen.auth_user_id is not null and karen_membership.status = 'active'
)
insert into public.membership_roles (membership_id, brokerage_id, role_key, granted_by_person_id)
select team.membership_id, team.brokerage_id, 'broker_staff', team.granted_by_person_id from team
where not exists (
  select 1 from public.membership_roles role where role.membership_id = team.membership_id
    and role.role_key = 'broker_staff' and role.ends_at is null
);

with team as (
  select karen_membership.id as membership_id, john.id as granted_by_person_id
  from public.people karen
  join public.brokerage_memberships karen_membership on karen_membership.person_id = karen.id
  join public.people john on lower(john.primary_email) = 'johnstamp@canadasap.com'
    and john.auth_user_id is not null
  where lower(karen.primary_email) = 'karenwei@canadasap.com'
    and karen.auth_user_id is not null and karen_membership.status = 'active'
), requested(permission_key) as (
  values ('listing.review'), ('listing.manage'), ('agent.manage'), ('inquiry.manage'), ('audit.view')
)
insert into public.membership_permissions (membership_id, permission_key, effect, granted_by_person_id, reason)
select team.membership_id, requested.permission_key, 'allow', team.granted_by_person_id,
  'Recorded demonstration staff access'
from team cross join requested
where not exists (
  select 1 from public.membership_permissions permission
  where permission.membership_id = team.membership_id
    and permission.permission_key = requested.permission_key and permission.ends_at is null
);

commit;
