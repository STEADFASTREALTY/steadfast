begin;
select plan(32);

select has_table('public','administrative_areas','administrative areas exist');
select has_table('public','localities','localities exist');
select has_table('public','property_addresses','private property addresses exist');
select has_table('public','properties','properties exist');
select has_table('public','listings','brokerage listings exist');
select has_table('public','listing_assignments','listing assignments exist');
select has_table('public','listing_versions','immutable listing versions exist');
select has_table('public','listing_reviews','listing reviews exist');
select has_table('public','listing_state_events','listing lifecycle history exists');
select results_eq($$select count(*)::bigint from public.administrative_areas where area_type='parish'$$,$$values (14::bigint)$$,'all Jamaican parishes are seeded');

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('53000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','listing.broker@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Listing Broker"}',now(),now()),
('53000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','listing.agent@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Listing Agent"}',now(),now()),
('53000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','listing.inactive@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Inactive Agent"}',now(),now());

insert into public.brokerages (id,slug,legal_name,display_name,status,country_id) values
('63000000-0000-4000-8000-000000000001','listing-realty','Listing Realty Limited','Listing Realty','active',(select id from public.countries where code='JM'));
insert into public.brokerage_memberships (id,brokerage_id,person_id,status,starts_at) values
('73000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000001'),'active',now()),
('73000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'),'active',now()),
('73000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000003'),'inactive',now());
insert into public.membership_roles (membership_id,brokerage_id,role_key) values
('73000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','broker'),
('73000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001','agent'),
('73000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000001','agent');

insert into public.property_addresses (id,country_id,administrative_area_id,address_line_1,normalized_address)
values ('83000000-0000-4000-8000-000000000001',(select id from public.countries where code='JM'),(select id from public.administrative_areas where code='JM-02'),'10 Test Avenue','10 test avenue saint andrew jamaica');
insert into public.properties (id,created_by_brokerage_id,property_type,address_id,address_fingerprint)
values ('84000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','residential','83000000-0000-4000-8000-000000000001',repeat('a',64));
insert into public.listings (id,brokerage_id,property_id,created_by_person_id)
values ('85000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002')),
('85000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'));

select lives_ok($$insert into public.listing_assignments (id,listing_id,brokerage_id,agent_membership_id,status,starts_at,assigned_by_person_id) values ('86000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','active',now(),(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000001'))$$,'an active same-brokerage agent can represent a listing');
select throws_like($$insert into public.listing_assignments (listing_id,brokerage_id,agent_membership_id,status,starts_at,assigned_by_person_id) values ('85000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000003','active',now(),(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000001'))$$,'%requires an active agent%','an inactive agent cannot represent a listing');

select lives_ok($$insert into public.listing_versions (id,listing_id,version_number,purpose,property_type,currency,price,title,description,created_by_person_id) values ('87000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001',1,'sale','residential','JMD',45000000,'Family home in Saint Andrew','A carefully maintained family home with generous living areas.',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'))$$,'a valid working version can be created');
select throws_like($$insert into public.listing_versions (listing_id,version_number,purpose,property_type,currency,price,title,description,created_by_person_id) values ('85000000-0000-4000-8000-000000000002',1,'sale','commercial','JMD',1,'Wrong property type','This version intentionally has the wrong property classification.',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'))$$,'%must match the property%','version classification must match its property');
select lives_ok($$update public.listing_versions set revision_state='submitted',submitted_by_person_id=(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'),submitted_at=now(),frozen_at=now() where id='87000000-0000-4000-8000-000000000001'$$,'a working draft can be frozen and submitted');
select throws_like($$insert into public.listing_reviews (listing_version_id,reviewer_person_id,reviewer_membership_id,decision) values ('87000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'),'73000000-0000-4000-8000-000000000002','approved')$$,'%lacks listing review authority%','an ordinary agent cannot review a submitted version');
select lives_ok($$insert into public.listing_reviews (listing_version_id,reviewer_person_id,reviewer_membership_id,decision) values ('87000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000001'),'73000000-0000-4000-8000-000000000001','approved')$$,'the broker can record a matching review decision');
select lives_ok($$update public.listing_versions set revision_state='approved',approved_at=now() where id='87000000-0000-4000-8000-000000000001'$$,'a submitted version can receive a controlled approval transition');
select lives_ok($$update public.listings set lifecycle_state='active',current_approved_version_id='87000000-0000-4000-8000-000000000001',current_assignment_id='86000000-0000-4000-8000-000000000001',published_at=now() where id='85000000-0000-4000-8000-000000000001'$$,'a listing with approved content and an active representative can activate');
select throws_like($$update public.listings set current_approved_version_id='87000000-0000-4000-8000-000000000001' where id='85000000-0000-4000-8000-000000000002'$$,'%version of this listing%','a listing cannot point to another listing version');
select lives_ok($$insert into public.listing_versions (listing_id,version_number,based_on_version_id,purpose,property_type,currency,price,title,description,created_by_person_id) values ('85000000-0000-4000-8000-000000000001',2,'87000000-0000-4000-8000-000000000001','sale','residential','JMD',46000000,'Updated family home','A proposed updated version of the approved family home listing.',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'))$$,'a new proposal can be based on the approved version');
select throws_like($$insert into public.listing_versions (listing_id,version_number,based_on_version_id,purpose,property_type,currency,price,title,description,created_by_person_id) values ('85000000-0000-4000-8000-000000000001',3,'87000000-0000-4000-8000-000000000001','sale','residential','JMD',47000000,'Conflicting proposal','A second simultaneous proposal that must be rejected by the database.',(select id from public.people where auth_user_id='53000000-0000-4000-8000-000000000002'))$$,'%duplicate key%','only one open material proposal is permitted');
select throws_like($$update public.listing_versions set title='Silently changed title' where id='87000000-0000-4000-8000-000000000001'$$,'%immutable%','approved version content is immutable');
select throws_like($$delete from public.listing_versions where id='87000000-0000-4000-8000-000000000001'$$,'%cannot be deleted%','listing versions are retained');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"53000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_like($$select * from public.listings$$,'%permission denied%','listing tables fail closed before role policies are introduced');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.agent_departure_commands values ('73000000-0000-4000-8000-000000000002','Agent left after active listing test')$$,'agent departure processes represented listings atomically');
reset role;

select results_eq($$select status from public.brokerage_memberships where id='73000000-0000-4000-8000-000000000002'$$,$$values ('departed'::text)$$,'departure ends the membership');
select results_eq($$select status from public.listing_assignments where id='86000000-0000-4000-8000-000000000001'$$,$$values ('invalidated'::text)$$,'departure invalidates the active assignment');
select results_eq($$select lifecycle_state || ':' || (current_assignment_id is null)::text from public.listings where id='85000000-0000-4000-8000-000000000001'$$,$$values ('unassigned:true'::text)$$,'departure leaves the listing unassigned');
select results_eq($$select (unpublished_at is not null)::text from public.listings where id='85000000-0000-4000-8000-000000000001'$$,$$values ('true'::text)$$,'departure records immediate unpublication');
select results_eq($$select count(*)::bigint from public.listing_state_events where listing_id='85000000-0000-4000-8000-000000000001' and to_state='unassigned'$$,$$values (1::bigint)$$,'departure writes listing lifecycle history');
select results_eq($$select (after_summary->>'unassigned_listing_count')::integer from public.audit_events where action='agent.departed' and target_id='73000000-0000-4000-8000-000000000002'$$,$$values (1)$$,'departure audit reports the affected listing count');

select * from finish();
rollback;
