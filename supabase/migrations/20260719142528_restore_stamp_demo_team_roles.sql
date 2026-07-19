begin;

-- Restore the explicitly documented demonstration roles after the test account
-- email migration. These statements are identity-based and safely no-op when
-- the demo people are absent (for example, in a clean local database).
with john as (
  select membership.id as membership_id, membership.brokerage_id, person.id as person_id
  from public.people person
  join public.brokerage_memberships membership on membership.person_id = person.id
  join public.professional_sites site on site.owner_person_id = person.id and site.slug = 'john-stamp'
  where lower(person.primary_email) = 'johnstamp@canadasap.com'
    and membership.status = 'active'
)
insert into public.membership_roles (
  membership_id, brokerage_id, role_key, granted_by_person_id
)
select john.membership_id, john.brokerage_id, 'broker', john.person_id
from john
where not exists (
  select 1 from public.membership_roles role
  where role.brokerage_id = john.brokerage_id
    and role.role_key = 'broker' and role.ends_at is null
)
and not exists (
  select 1 from public.membership_roles role
  where role.membership_id = john.membership_id
    and role.role_key = 'broker' and role.ends_at is null
);

with demo as (
  select membership.id as membership_id, membership.brokerage_id,
    john.id as granted_by_person_id
  from public.people karen
  join public.brokerage_memberships membership on membership.person_id = karen.id
  join public.professional_sites karen_site on karen_site.owner_person_id = karen.id and karen_site.slug = 'karen-wei'
  cross join lateral (
    select person.id from public.people person
    join public.professional_sites site on site.owner_person_id = person.id and site.slug = 'john-stamp'
    where lower(person.primary_email) = 'johnstamp@canadasap.com'
    limit 1
  ) john
  where lower(karen.primary_email) = 'karenwei@canadasap.com'
    and membership.status = 'active'
)
insert into public.membership_roles (
  membership_id, brokerage_id, role_key, granted_by_person_id
)
select demo.membership_id, demo.brokerage_id, 'broker_staff', demo.granted_by_person_id
from demo
where not exists (
  select 1 from public.membership_roles role
  where role.membership_id = demo.membership_id
    and role.role_key = 'broker_staff' and role.ends_at is null
);

with demo as (
  select membership.id as membership_id, john.id as granted_by_person_id
  from public.people karen
  join public.brokerage_memberships membership on membership.person_id = karen.id
  join public.professional_sites karen_site on karen_site.owner_person_id = karen.id and karen_site.slug = 'karen-wei'
  cross join lateral (
    select person.id from public.people person
    join public.professional_sites site on site.owner_person_id = person.id and site.slug = 'john-stamp'
    where lower(person.primary_email) = 'johnstamp@canadasap.com'
    limit 1
  ) john
  where lower(karen.primary_email) = 'karenwei@canadasap.com'
    and membership.status = 'active'
), requested(permission_key) as (
  values ('listing.review'), ('listing.manage'), ('agent.manage'),
    ('inquiry.manage'), ('audit.view')
)
insert into public.membership_permissions (
  membership_id, permission_key, effect, granted_by_person_id, reason
)
select demo.membership_id, requested.permission_key, 'allow',
  demo.granted_by_person_id, 'Recorded demonstration staff access'
from demo cross join requested
where not exists (
  select 1 from public.membership_permissions permission
  where permission.membership_id = demo.membership_id
    and permission.permission_key = requested.permission_key
    and permission.ends_at is null
);

commit;
