begin;

-- Bind the documented test roles to the people rows owned by the actual Auth
-- accounts, rather than to any older duplicate demonstration profiles.
with john as (
  select membership.id as membership_id, membership.brokerage_id, person.id as person_id
  from auth.users auth_user
  join public.people person on person.auth_user_id = auth_user.id
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(auth_user.email) = 'johnstamp@canadasap.com'
    and membership.status = 'active'
)
update public.membership_roles role
set ends_at = greatest(clock_timestamp(), role.starts_at + interval '1 microsecond')
from john
where role.brokerage_id = john.brokerage_id
  and role.role_key = 'broker' and role.ends_at is null
  and role.membership_id <> john.membership_id;

with john as (
  select membership.id as membership_id, membership.brokerage_id, person.id as person_id
  from auth.users auth_user
  join public.people person on person.auth_user_id = auth_user.id
  join public.brokerage_memberships membership on membership.person_id = person.id
  where lower(auth_user.email) = 'johnstamp@canadasap.com'
    and membership.status = 'active'
)
insert into public.membership_roles (membership_id, brokerage_id, role_key, granted_by_person_id)
select john.membership_id, john.brokerage_id, 'broker', john.person_id
from john
where not exists (
  select 1 from public.membership_roles role
  where role.membership_id = john.membership_id
    and role.role_key = 'broker' and role.ends_at is null
);

with actors as (
  select karen_membership.id as membership_id,
    karen_membership.brokerage_id, john_person.id as granted_by_person_id
  from auth.users karen_auth
  join public.people karen_person on karen_person.auth_user_id = karen_auth.id
  join public.brokerage_memberships karen_membership on karen_membership.person_id = karen_person.id
  join auth.users john_auth on lower(john_auth.email) = 'johnstamp@canadasap.com'
  join public.people john_person on john_person.auth_user_id = john_auth.id
  where lower(karen_auth.email) = 'karenwei@canadasap.com'
    and karen_membership.status = 'active'
)
insert into public.membership_roles (membership_id, brokerage_id, role_key, granted_by_person_id)
select actors.membership_id, actors.brokerage_id, 'broker_staff', actors.granted_by_person_id
from actors
where not exists (
  select 1 from public.membership_roles role
  where role.membership_id = actors.membership_id
    and role.role_key = 'broker_staff' and role.ends_at is null
);

with actors as (
  select karen_membership.id as membership_id, john_person.id as granted_by_person_id
  from auth.users karen_auth
  join public.people karen_person on karen_person.auth_user_id = karen_auth.id
  join public.brokerage_memberships karen_membership on karen_membership.person_id = karen_person.id
  join auth.users john_auth on lower(john_auth.email) = 'johnstamp@canadasap.com'
  join public.people john_person on john_person.auth_user_id = john_auth.id
  where lower(karen_auth.email) = 'karenwei@canadasap.com'
    and karen_membership.status = 'active'
), requested(permission_key) as (
  values ('listing.review'), ('listing.manage'), ('agent.manage'),
    ('inquiry.manage'), ('audit.view')
)
update public.membership_permissions permission
set effect = 'allow', reason = 'Recorded demonstration staff access'
from actors, requested
where permission.membership_id = actors.membership_id
  and permission.permission_key = requested.permission_key
  and permission.ends_at is null;

with actors as (
  select karen_membership.id as membership_id, john_person.id as granted_by_person_id
  from auth.users karen_auth
  join public.people karen_person on karen_person.auth_user_id = karen_auth.id
  join public.brokerage_memberships karen_membership on karen_membership.person_id = karen_person.id
  join auth.users john_auth on lower(john_auth.email) = 'johnstamp@canadasap.com'
  join public.people john_person on john_person.auth_user_id = john_auth.id
  where lower(karen_auth.email) = 'karenwei@canadasap.com'
    and karen_membership.status = 'active'
), requested(permission_key) as (
  values ('listing.review'), ('listing.manage'), ('agent.manage'),
    ('inquiry.manage'), ('audit.view')
)
insert into public.membership_permissions (
  membership_id, permission_key, effect, granted_by_person_id, reason
)
select actors.membership_id, requested.permission_key, 'allow',
  actors.granted_by_person_id, 'Recorded demonstration staff access'
from actors cross join requested
where not exists (
  select 1 from public.membership_permissions permission
  where permission.membership_id = actors.membership_id
    and permission.permission_key = requested.permission_key
    and permission.ends_at is null
);

commit;
