begin;
select plan(14);

select has_table('public', 'agent_departure_commands', 'agent departure command boundary exists');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('52000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','departure.broker@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Departure Broker"}',now(),now()),
('52000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','departure.manager@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Departure Manager"}',now(),now()),
('52000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','departure.agent@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Departure Agent"}',now(),now()),
('52000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','departure.dual@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Departure Dual"}',now(),now()),
('52000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','departure.otherbroker@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Other Departure Broker"}',now(),now());

insert into public.brokerages (id,slug,legal_name,display_name,status,country_id) values
('62000000-0000-4000-8000-000000000001','departure-realty','Departure Realty Limited','Departure Realty','active',(select id from public.countries where code='JM')),
('62000000-0000-4000-8000-000000000002','other-departure-realty','Other Departure Realty Limited','Other Departure Realty','active',(select id from public.countries where code='JM'));

insert into public.brokerage_memberships (id,brokerage_id,person_id,status,starts_at) values
('72000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='52000000-0000-4000-8000-000000000001'),'active',now()),
('72000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='52000000-0000-4000-8000-000000000002'),'active',now()),
('72000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='52000000-0000-4000-8000-000000000003'),'active',now()),
('72000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='52000000-0000-4000-8000-000000000004'),'active',now()),
('72000000-0000-4000-8000-000000000005','62000000-0000-4000-8000-000000000002',(select id from public.people where auth_user_id='52000000-0000-4000-8000-000000000005'),'active',now());

insert into public.membership_roles (membership_id,brokerage_id,role_key) values
('72000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','broker'),
('72000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','broker_staff'),
('72000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','agent'),
('72000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000001','agent'),
('72000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000001','broker_staff'),
('72000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000001','agent'),
('72000000-0000-4000-8000-000000000005','62000000-0000-4000-8000-000000000002','broker');

insert into public.membership_permissions (membership_id,permission_key,effect,granted_by_person_id) values
('72000000-0000-4000-8000-000000000002','agent.manage','allow',(select id from public.people where auth_user_id='52000000-0000-4000-8000-000000000001')),
('72000000-0000-4000-8000-000000000003','report.view','allow',(select id from public.people where auth_user_id='52000000-0000-4000-8000-000000000001'));

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.agent_departure_commands values ('72000000-0000-4000-8000-000000000003','Agent left the brokerage')$$,'broker can end an agent membership');
reset role;

select results_eq($$select status from public.brokerage_memberships where id='72000000-0000-4000-8000-000000000003'$$,$$values ('departed'::text)$$,'membership becomes departed');
select is_empty($$select * from public.membership_roles where membership_id='72000000-0000-4000-8000-000000000003' and ends_at is null$$,'active roles end');
select is_empty($$select * from public.membership_permissions where membership_id='72000000-0000-4000-8000-000000000003' and ends_at is null$$,'active grants end');
select results_eq($$select account_status from public.people where auth_user_id='52000000-0000-4000-8000-000000000003'$$,$$values ('active'::text)$$,'personal account remains active');
select results_eq($$select count(*)::bigint from public.audit_events where action='agent.departed' and target_id='72000000-0000-4000-8000-000000000003'$$,$$values (1::bigint)$$,'departure is audited');
select is_empty($$select * from public.agent_departure_commands$$,'command row is not persisted');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"52000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$insert into public.agent_departure_commands values ('72000000-0000-4000-8000-000000000004','Manager processed departure')$$,'delegated agent manager can end an agent membership');
select throws_like($$insert into public.agent_departure_commands values ('72000000-0000-4000-8000-000000000002','Trying self departure')$$,'%cannot end your own%','manager cannot deactivate themselves');
select throws_like($$insert into public.agent_departure_commands values ('72000000-0000-4000-8000-000000000005','Cross brokerage attempt')$$,'%Permission denied%','cross-brokerage departure is denied');
reset role;

select results_eq($$select status from public.brokerage_memberships where id='72000000-0000-4000-8000-000000000004'$$,$$values ('departed'::text)$$,'delegated departure is committed');
select results_eq($$select count(*)::bigint from public.audit_events where action='agent.departed'$$,$$values (2::bigint)$$,'every successful departure has an audit event');
select is_empty($$select * from public.agent_departure_commands$$,'all departure commands remain write-only');

select * from finish();
rollback;
