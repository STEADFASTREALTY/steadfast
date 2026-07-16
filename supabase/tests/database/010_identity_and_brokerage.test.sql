begin;

select plan(26);

select has_table('public', 'people', 'people table exists');
select has_table('public', 'brokerages', 'brokerages table exists');
select has_table('public', 'brokerage_memberships', 'brokerage memberships table exists');
select has_table('public', 'brokerage_invitations', 'brokerage invitations table exists');
select has_table('public', 'agent_applications', 'agent applications table exists');
select has_table('public', 'audit_events', 'audit table exists');

select results_eq(
  $$
    select count(*)::bigint
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'countries', 'people', 'consumer_profiles', 'professional_profiles',
        'role_definitions', 'permission_definitions', 'role_permissions',
        'brokerages', 'brokerage_memberships', 'membership_roles',
        'membership_permissions', 'person_platform_roles',
        'brokerage_invitations', 'brokerage_invitation_roles',
        'agent_applications', 'audit_events'
      )
      and relation.relrowsecurity
  $$,
  $$ values (16::bigint) $$,
  'row level security is enabled on every M1 exposed table'
);

select results_eq(
  $$ select count(*)::bigint from public.role_definitions $$,
  $$ values (6::bigint) $$,
  'the approved MVP role catalogue is seeded'
);

select results_eq(
  $$ select count(*)::bigint from public.permission_definitions where scope = 'brokerage' $$,
  $$ values (17::bigint) $$,
  'the brokerage permission catalogue is seeded'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'broker.one@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Broker One"}', now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'staff.agent@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Staff Agent"}', now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'broker.two@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Broker Two"}', now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'applicant@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Applicant"}', now(), now()
  );

select results_eq(
  $$ select count(*)::bigint from public.people where auth_user_id is not null $$,
  $$ values (4::bigint) $$,
  'creating an auth user creates exactly one application person'
);

insert into public.brokerages (
  id, slug, legal_name, display_name, status, country_id
) values
  (
    '10000000-0000-4000-8000-000000000001', 'blue-mountain-realty',
    'Blue Mountain Realty Limited', 'Blue Mountain Realty', 'active',
    (select id from public.countries where code = 'JM')
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'harbour-view-properties',
    'Harbour View Properties Limited', 'Harbour View Properties', 'active',
    (select id from public.countries where code = 'JM')
  );

insert into public.brokerage_memberships (
  id, brokerage_id, person_id, status, starts_at
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    (select id from public.people where auth_user_id = '00000000-0000-4000-8000-000000000001'),
    'active', now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    (select id from public.people where auth_user_id = '00000000-0000-4000-8000-000000000002'),
    'active', now()
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    (select id from public.people where auth_user_id = '00000000-0000-4000-8000-000000000003'),
    'active', now()
  );

insert into public.membership_roles (membership_id, brokerage_id, role_key) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'broker'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', 'broker_staff'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', 'agent'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002', 'broker'
  );

insert into public.membership_permissions (
  membership_id, permission_key, effect, granted_by_person_id
) values (
  '20000000-0000-4000-8000-000000000002', 'listing.review', 'allow',
  (select id from public.people where auth_user_id = '00000000-0000-4000-8000-000000000001')
);

insert into public.brokerage_invitations (
  id, brokerage_id, email, token_digest, invited_by_person_id, expires_at
) values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'invitee@example.test', repeat('a', 64),
  (select id from public.people where auth_user_id = '00000000-0000-4000-8000-000000000001'),
  now() + interval '7 days'
);

insert into public.agent_applications (
  id, person_id, brokerage_id, status, submitted_at
) values (
  '40000000-0000-4000-8000-000000000001',
  (select id from public.people where auth_user_id = '00000000-0000-4000-8000-000000000004'),
  '10000000-0000-4000-8000-000000000001', 'submitted', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

reset role;
select is(
  app_private.current_person_id(),
  (select id from public.people where auth_user_id = '00000000-0000-4000-8000-000000000002'),
  'the authenticated user maps to the correct application person'
);
set local role authenticated;

select results_eq(
  $$ select count(*)::bigint from public.people $$,
  $$ values (1::bigint) $$,
  'a person can read only their own private identity row'
);

select results_eq(
  $$ select count(*)::bigint from public.brokerage_memberships $$,
  $$ values (1::bigint) $$,
  'staff without agent management sees only their own membership'
);

reset role;
select ok(
  app_private.has_brokerage_permission(
    '10000000-0000-4000-8000-000000000001', 'listing.review'
  ),
  'an explicit staff permission grant is effective'
);

select ok(
  not app_private.has_brokerage_permission(
    '10000000-0000-4000-8000-000000000001', 'agent.manage'
  ),
  'staff does not gain undelegated brokerage permissions'
);
set local role authenticated;

select results_eq(
  $$ select count(*)::bigint from public.brokerage_invitations $$,
  $$ values (0::bigint) $$,
  'staff without staff management cannot read invitations'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

reset role;
select ok(
  app_private.has_brokerage_permission(
    '10000000-0000-4000-8000-000000000001', 'agent.manage'
  ),
  'a broker has the full brokerage permission catalogue'
);
set local role authenticated;

select results_eq(
  $$ select count(*)::bigint from public.brokerage_memberships $$,
  $$ values (2::bigint) $$,
  'a broker sees memberships only inside their own brokerage'
);

select results_eq(
  $$ select count(*)::bigint from public.brokerage_invitations $$,
  $$ values (1::bigint) $$,
  'a broker can read their brokerage invitation metadata'
);

select results_eq(
  $$ select count(*)::bigint from public.agent_applications $$,
  $$ values (1::bigint) $$,
  'a broker can read agent applications for their brokerage'
);

select ok(
  not has_column_privilege('authenticated', 'public.brokerage_invitations', 'token_digest', 'select'),
  'invitation token digests are not readable through the Data API'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'insert')
  and not has_table_privilege('authenticated', 'public.audit_events', 'update')
  and not has_table_privilege('authenticated', 'public.audit_events', 'delete'),
  'business audit events are append-only for application users'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$ select count(*)::bigint from public.brokerages $$,
  $$ values (2::bigint) $$,
  'anonymous visitors can read the active brokerage directory'
);

select ok(
  not has_table_privilege('anon', 'public.people', 'select'),
  'anonymous visitors cannot read private identity data'
);

reset role;

select has_index(
  'public', 'brokerage_memberships',
  'brokerage_memberships_one_active_per_person_idx',
  'one active brokerage membership per person is enforced'
);

select has_index(
  'public', 'membership_roles',
  'membership_roles_one_active_broker_idx',
  'one active principal broker per brokerage is enforced'
);

select * from finish();

rollback;
