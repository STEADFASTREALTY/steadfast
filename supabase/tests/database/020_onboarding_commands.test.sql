begin;

select plan(19);

select has_table('public', 'agent_application_commands', 'agent application command boundary exists');
select has_table('public', 'agent_application_decision_commands', 'application decision command boundary exists');
select has_table('public', 'brokerage_invitation_commands', 'invitation command boundary exists');
select has_table('public', 'brokerage_invitation_acceptance_commands', 'invitation acceptance command boundary exists');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '50000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'command.broker@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Command Broker"}', now(), now()
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'command.applicant@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Command Applicant"}', now(), now()
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'command.invitee@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Command Invitee"}', now(), now()
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'wrong.invitee@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Wrong Invitee"}', now(), now()
  );

insert into public.brokerages (
  id, slug, legal_name, display_name, status, country_id
) values (
  '60000000-0000-4000-8000-000000000001', 'command-realty',
  'Command Realty Limited', 'Command Realty', 'active',
  (select id from public.countries where code = 'JM')
);

insert into public.brokerage_memberships (
  id, brokerage_id, person_id, status, starts_at
) values (
  '70000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  (select id from public.people where auth_user_id = '50000000-0000-4000-8000-000000000001'),
  'active', now()
);

insert into public.membership_roles (membership_id, brokerage_id, role_key) values (
  '70000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001', 'broker'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.agent_application_commands (brokerage_id)
    values ('60000000-0000-4000-8000-000000000001')
  $$,
  'a registered person can submit an agent application command'
);

select results_eq(
  $$ select status from public.agent_applications $$,
  $$ values ('submitted'::text) $$,
  'an application command creates a submitted application owned by the caller'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.agent_application_decision_commands (
      application_id, decision, reason
    )
    select id, 'approve', 'Approved by the principal broker'
    from public.agent_applications
    limit 1
  $$,
  'an authorized broker can approve an application command'
);

select results_eq(
  $$
    select application.status
    from public.agent_applications as application
    order by application.created_at
    limit 1
  $$,
  $$ values ('activated'::text) $$,
  'broker approval activates the application'
);

select results_eq(
  $$
    select role.role_key
    from public.membership_roles as role
    join public.brokerage_memberships as membership on membership.id = role.membership_id
    where membership.brokerage_id = '60000000-0000-4000-8000-000000000001'
      and membership.status = 'active'
      and role.role_key = 'agent'
  $$,
  $$ values ('agent'::text) $$,
  'broker approval creates the active agent membership atomically'
);

select lives_ok(
  $$
    insert into public.brokerage_invitation_commands (
      brokerage_id, email, token_digest, role_keys, expires_at
    ) values (
      '60000000-0000-4000-8000-000000000001',
      'command.invitee@example.test', repeat('b', 64),
      array['agent', 'broker_staff'], now() + interval '7 days'
    )
  $$,
  'a broker can create a dual-role invitation command'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.brokerage_invitation_roles
  $$,
  $$ values (2::bigint) $$,
  'the invitation stores both requested roles without duplicating identity'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select throws_like(
  $$
    insert into public.brokerage_invitation_acceptance_commands (token_digest)
    values (repeat('b', 64))
  $$,
  '%Invitation email does not match%',
  'a stolen invitation token cannot be accepted by a different account'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.brokerage_invitation_acceptance_commands (token_digest)
    values (repeat('b', 64))
  $$,
  'the intended signed-in person can accept the invitation'
);

reset role;

select results_eq(
  $$
    select status from public.brokerage_invitations
    where token_digest = repeat('b', 64)
  $$,
  $$ values ('accepted'::text) $$,
  'acceptance closes the invitation'
);

select results_eq(
  $$
    select role.role_key
    from public.membership_roles as role
    join public.brokerage_memberships as membership on membership.id = role.membership_id
    where membership.person_id = (
      select id from public.people
      where auth_user_id = '50000000-0000-4000-8000-000000000003'
    )
    order by role.role_key
  $$,
  $$ values ('agent'::text), ('broker_staff'::text) $$,
  'invitation acceptance creates both roles on one membership'
);

select results_eq(
  $$
    select
      (select count(*) from public.agent_application_commands)
      + (select count(*) from public.agent_application_decision_commands)
      + (select count(*) from public.brokerage_invitation_commands)
      + (select count(*) from public.brokerage_invitation_acceptance_commands)
  $$,
  $$ values (0::bigint) $$,
  'write-only command rows are never persisted'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.audit_events
    where action in (
      'agent_application.submitted',
      'agent_application.approved',
      'brokerage_invitation.created',
      'brokerage_invitation.accepted'
    )
  $$,
  $$ values (4::bigint) $$,
  'every onboarding transition creates an append-only audit event'
);

select ok(
  not has_table_privilege('anon', 'public.agent_application_commands', 'insert')
  and not has_table_privilege('anon', 'public.brokerage_invitation_acceptance_commands', 'insert'),
  'anonymous Data API users cannot invoke onboarding commands'
);

select ok(
  not has_table_privilege('authenticated', 'public.agent_application_commands', 'select')
  and not has_table_privilege('authenticated', 'public.brokerage_invitation_commands', 'select'),
  'authenticated users cannot read command payloads'
);

select * from finish();

rollback;
