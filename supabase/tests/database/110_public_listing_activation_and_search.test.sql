begin;
select plan(30);

select has_table('public', 'public_listing_snapshots', 'sanitized public listing projection exists');
select has_table('public', 'publication_records', 'publication history table exists');
select has_table('public', 'activate_public_listing_commands', 'write-only public activation boundary exists');
select hasnt_column('public','public_listing_snapshots','address_line_1', 'public projection has no raw street address column');
select hasnt_column('public','public_listing_snapshots','object_path', 'public projection has no private media path column');

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('5a000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','public.agent@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Public Agent"}',now(),now()),
('5a000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','public.staff@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Public Staff"}',now(),now()),
('5a000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','public.broker@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Public Broker"}',now(),now());

insert into public.professional_profiles (person_id,public_slug)
select id,'public-agent' from public.people where auth_user_id='5a000000-0000-4000-8000-000000000001';
insert into public.brokerages (id,slug,legal_name,display_name,status,country_id) values
('6a000000-0000-4000-8000-000000000001','public-realty','Public Realty Limited','Public Realty','active',(select id from public.countries where code='JM'));
insert into public.brokerage_memberships (id,brokerage_id,person_id,status,starts_at) values
('7a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='5a000000-0000-4000-8000-000000000001'),'active',now()),
('7a000000-0000-4000-8000-000000000002','6a000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='5a000000-0000-4000-8000-000000000002'),'active',now()),
('7a000000-0000-4000-8000-000000000003','6a000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='5a000000-0000-4000-8000-000000000003'),'active',now());
insert into public.membership_roles (membership_id,brokerage_id,role_key) values
('7a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000001','agent'),
('7a000000-0000-4000-8000-000000000002','6a000000-0000-4000-8000-000000000001','broker_staff'),
('7a000000-0000-4000-8000-000000000003','6a000000-0000-4000-8000-000000000001','broker');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,property_subtype,price,title,description,bedrooms,bathrooms,visibility,public_location_precision)
values ('8a000000-0000-4000-8000-000000000001',(select id from public.administrative_areas where code='JM-02'),'14 Private Address Road','sale','residential','house',48500000,'Approved public family home','A carefully presented family property used to verify the safe public marketplace projection.',3,2,'public','area');
insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values
('9a000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001','public-home.jpg','image/jpeg',2500,'6a000000-0000-4000-8000-000000000001/8a000000-0000-4000-8000-000000000001/9a000000-0000-4000-8000-000000000001/original.jpg');
reset role;
update public.listing_media set status='ready',detected_mime_type='image/jpeg',actual_byte_size=2500,width=1400,height=900,validated_at=now(),updated_at=now() where id='9a000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.submit_listing_version_commands (request_id,listing_id,listing_version_id,expected_lock_version)
values ('aa000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001',(select id from public.listing_versions where listing_id='8a000000-0000-4000-8000-000000000001'),1);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.decide_listing_review_commands (request_id,review_id,listing_id,listing_version_id,decision,comment)
values ('aa000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001',(select id from public.listing_versions where listing_id='8a000000-0000-4000-8000-000000000001'),'approved','Approved for publication review.');
reset role;

select results_eq($$select lifecycle_state,lock_version from public.listings where id='8a000000-0000-4000-8000-000000000001'$$,$$values ('approved_inactive'::text,3)$$,'approval remains private before explicit activation');
select results_eq($$select count(*)::bigint from public.public_listing_snapshots$$,$$values (0::bigint)$$,'approval alone creates no public projection');

set local role anon;
select throws_like($$insert into public.activate_public_listing_commands (request_id,listing_id,approved_version_id,expected_lock_version,confirm_publication) values (gen_random_uuid(),'8a000000-0000-4000-8000-000000000001',(select current_approved_version_id from public.listings where id='8a000000-0000-4000-8000-000000000001'),3,true)$$,'%permission denied%','visitors cannot activate listings');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_like($$insert into public.activate_public_listing_commands (request_id,listing_id,approved_version_id,expected_lock_version,confirm_publication) values (gen_random_uuid(),'8a000000-0000-4000-8000-000000000001',(select current_approved_version_id from public.listings where id='8a000000-0000-4000-8000-000000000001'),3,true)$$,'%publication authority%','agents cannot publish their approved content without brokerage authority');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_like($$insert into public.activate_public_listing_commands (request_id,listing_id,approved_version_id,expected_lock_version,confirm_publication) values (gen_random_uuid(),'8a000000-0000-4000-8000-000000000001',(select current_approved_version_id from public.listings where id='8a000000-0000-4000-8000-000000000001'),3,true)$$,'%publication authority%','broker staff require delegated review authority before publication');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_like($$insert into public.activate_public_listing_commands (request_id,listing_id,approved_version_id,expected_lock_version,confirm_publication) values (gen_random_uuid(),'8a000000-0000-4000-8000-000000000001',(select current_approved_version_id from public.listings where id='8a000000-0000-4000-8000-000000000001'),2,true)$$,'%changed before publication%','stale activation commands fail optimistic concurrency');
select lives_ok($$insert into public.activate_public_listing_commands (request_id,listing_id,approved_version_id,expected_lock_version,confirm_publication) values ('aa000000-0000-4000-8000-000000000003','8a000000-0000-4000-8000-000000000001',(select current_approved_version_id from public.listings where id='8a000000-0000-4000-8000-000000000001'),3,true)$$,'an authorized broker can explicitly activate eligible approved content');
select throws_like($$select * from public.activate_public_listing_commands$$,'%permission denied%','activation commands are write only');
reset role;

select results_eq($$select lifecycle_state,published_at is not null,lock_version from public.listings where id='8a000000-0000-4000-8000-000000000001'$$,$$values ('active'::text,true,4)$$,'activation atomically advances public lifecycle and lock state');
select results_eq($$select title,administrative_area_name,public_location_label,assigned_agent_name,brokerage_name,ready_media_count from public.public_listing_snapshots where listing_id='8a000000-0000-4000-8000-000000000001'$$,$$values ('Approved public family home'::text,'Saint Andrew'::text,'Saint Andrew'::text,'Public Agent'::text,'Public Realty'::text,1)$$,'snapshot contains only approved display and representative facts');
select results_eq($$select public_latitude is null,public_longitude is null from public.public_listing_snapshots where listing_id='8a000000-0000-4000-8000-000000000001'$$,$$values (true,true)$$,'unknown coordinates are never guessed during publication');
select results_eq($$select status,surface,removed_at is null from public.publication_records where listing_id='8a000000-0000-4000-8000-000000000001'$$,$$values ('active'::text,'marketplace'::text,true)$$,'marketplace publication history records the active approved version');
select results_eq($$select count(*)::bigint from public.listing_state_events where listing_id='8a000000-0000-4000-8000-000000000001' and from_state='approved_inactive' and to_state='active'$$,$$values (1::bigint)$$,'activation appends a lifecycle event');
select results_eq($$select count(*)::bigint from public.audit_events where target_id='8a000000-0000-4000-8000-000000000001' and action='listing.activated'$$,$$values (1::bigint)$$,'activation appends a safe attributed audit event');

set local role anon;
select results_eq($$select listing_id,title,price from public.public_listing_snapshots$$,$$values ('8a000000-0000-4000-8000-000000000001'::uuid,'Approved public family home'::text,48500000.00::numeric)$$,'visitors can read the eligible sanitized snapshot');
select results_eq($$select count(*)::bigint from public.public_listing_snapshots where search_document @@ websearch_to_tsquery('simple','Saint Andrew house')$$,$$values (1::bigint)$$,'public search document supports location and property queries');
select throws_like($$select * from public.property_addresses$$,'%permission denied%','visitors cannot query raw addresses');
select throws_like($$select * from public.listing_versions$$,'%permission denied%','visitors cannot query raw versions');
select throws_like($$update public.public_listing_snapshots set title='Changed'$$,'%permission denied%','visitors cannot mutate the public projection');
reset role;

update public.brokerages set status='suspended_billing' where id='6a000000-0000-4000-8000-000000000001';
set local role anon;
select results_eq($$select count(*)::bigint from public.public_listing_snapshots$$,$$values (0::bigint)$$,'dynamic eligibility immediately hides suspended brokerage inventory');
reset role;
update public.brokerages set status='active' where id='6a000000-0000-4000-8000-000000000001';
set local role anon;
select results_eq($$select count(*)::bigint from public.public_listing_snapshots$$,$$values (1::bigint)$$,'restored eligibility makes the retained projection readable again');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.agent_departure_commands (membership_id,reason) values ('7a000000-0000-4000-8000-000000000001','Agent departed after publication test');
reset role;
select results_eq($$select lifecycle_state,current_assignment_id is null from public.listings where id='8a000000-0000-4000-8000-000000000001'$$,$$values ('unassigned'::text,true)$$,'agent departure immediately removes the active representative');
select results_eq($$select count(*)::bigint from public.public_listing_snapshots where listing_id='8a000000-0000-4000-8000-000000000001'$$,$$values (0::bigint)$$,'ineligible lifecycle transition removes the public snapshot');
select results_eq($$select status,removed_at is not null from public.publication_records where listing_id='8a000000-0000-4000-8000-000000000001'$$,$$values ('removed'::text,true)$$,'publication history retains the automatic removal');
select results_eq($$select count(*)::bigint from public.notifications where target_id='8a000000-0000-4000-8000-000000000001' and body_safe like '%Private Address%'$$,$$values (0::bigint)$$,'no notification leaks the raw property address');

select * from finish();
rollback;
