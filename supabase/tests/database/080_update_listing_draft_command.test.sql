begin;
select plan(20);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('56000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','edit.agent@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Edit Agent"}',now(),now()),
('56000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','edit.other@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Other Agent"}',now(),now()),
('56000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','edit.broker@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Edit Broker"}',now(),now());
insert into public.brokerages (id,slug,legal_name,display_name,status,country_id) values
('66000000-0000-4000-8000-000000000001','edit-realty','Edit Realty Limited','Edit Realty','active',(select id from public.countries where code='JM'));
insert into public.brokerage_memberships (id,brokerage_id,person_id,status,starts_at) values
('76000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='56000000-0000-4000-8000-000000000001'),'active',now()),
('76000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='56000000-0000-4000-8000-000000000002'),'active',now()),
('76000000-0000-4000-8000-000000000003','66000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='56000000-0000-4000-8000-000000000003'),'active',now());
insert into public.membership_roles (membership_id,brokerage_id,role_key) values
('76000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','agent'),
('76000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001','agent'),
('76000000-0000-4000-8000-000000000003','66000000-0000-4000-8000-000000000001','broker');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,property_subtype,price,title,description,bedrooms,bathrooms,building_area,area_unit,visibility,public_location_precision)
values ('89000000-0000-4000-8000-000000000001',(select id from public.administrative_areas where code='JM-02'),'10 First Street','sale','residential','House',30000000,'Original family home','The original private working draft used for recoverable editing tests.',3,2,1800,'sq_ft','public','area');
reset role;

set local role anon;
select throws_like($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',1,'manual',(select id from public.administrative_areas where code='JM-02'),'10 First Street','sale','residential',30000000,'Visitor edit','A visitor must never be able to update this private listing draft.','public','area')$$,'%permission denied%','visitors cannot invoke draft editing');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,address_line_2,purpose,property_type,property_subtype,price,title,description,bedrooms,bathrooms,building_area,area_unit,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',1,'manual',(select id from public.administrative_areas where code='JM-08'),'22 New Address','Unit 3','sale','residential','Apartment',36500000,'Updated ocean-view home','The assigned agent saved a revised private description without creating an approval event.',2,2.5,1500,'sq_ft','public','street')$$,'the assigned agent can save an editable working draft');
reset role;

select results_eq($$select lock_version from public.listings where id='89000000-0000-4000-8000-000000000001'$$,$$values (2)$$,'a material save advances the optimistic lock');
select results_eq($$select title from public.listing_versions where listing_id='89000000-0000-4000-8000-000000000001'$$,$$values ('Updated ocean-view home'::text)$$,'the working version receives the saved content');
select results_eq($$select address_line_1 from public.property_addresses where id=(select address_id from public.properties where id=(select property_id from public.listings where id='89000000-0000-4000-8000-000000000001'))$$,$$values ('22 New Address'::text)$$,'an address edit points the listing to a new private property candidate');
select results_eq($$select count(*)::bigint from public.properties where created_by_brokerage_id='66000000-0000-4000-8000-000000000001'$$,$$values (2::bigint)$$,'address editing does not mutate the retained original property');
select results_eq($$select changed_fields @> array['address','title','price'] from public.listing_versions where listing_id='89000000-0000-4000-8000-000000000001'$$,$$values (true)$$,'the draft records which fields changed in the latest material save');
select results_eq($$select count(*)::bigint from public.audit_events where action='listing.draft_saved' and target_id='89000000-0000-4000-8000-000000000001'$$,$$values (1::bigint)$$,'a manual save appends a privacy-safe audit event');
select is_empty($$select * from public.update_listing_draft_commands$$,'draft update command payloads are never stored');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,address_line_2,purpose,property_type,property_subtype,price,title,description,bedrooms,bathrooms,building_area,area_unit,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',2,'autosave',(select id from public.administrative_areas where code='JM-08'),'22 New Address','Unit 3','sale','residential','Apartment',36500000,'Updated ocean-view home','The assigned agent saved a revised private description without creating an approval event.',2,2.5,1500,'sq_ft','public','street')$$,'an identical autosave is accepted as an idempotent no-op');
reset role;
select results_eq($$select lock_version from public.listings where id='89000000-0000-4000-8000-000000000001'$$,$$values (2)$$,'an identical autosave does not advance the optimistic lock');
select results_eq($$select count(*)::bigint from public.audit_events where action='listing.draft_saved' and target_id='89000000-0000-4000-8000-000000000001'$$,$$values (1::bigint)$$,'autosave does not create noisy audit history');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_like($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',1,'manual',(select id from public.administrative_areas where code='JM-08'),'22 New Address','sale','residential',1,'Stale overwrite attempt','This stale browser tab must not replace the newer saved listing content.','public','area')$$,'%Draft changed since it was opened%','a stale browser tab receives a recoverable concurrency conflict');
reset role;
select results_eq($$select title from public.listing_versions where listing_id='89000000-0000-4000-8000-000000000001'$$,$$values ('Updated ocean-view home'::text)$$,'the conflict leaves the newer draft unchanged');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_like($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',2,'manual',(select id from public.administrative_areas where code='JM-08'),'22 New Address','sale','residential',36500000,'Unauthorized edit','Another agent in the brokerage cannot edit a listing they do not represent.','public','area')$$,'%Permission denied%','another unassigned agent cannot edit the private draft');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,address_line_2,purpose,property_type,property_subtype,price,title,description,bedrooms,bathrooms,building_area,area_unit,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',2,'manual',(select id from public.administrative_areas where code='JM-08'),'22 New Address','Unit 3','sale','residential','Apartment',37000000,'Broker-corrected ocean-view home','The principal broker may coordinate an unsubmitted brokerage listing draft.',2,2.5,1500,'sq_ft','public','street')$$,'the principal broker can coordinate an unsubmitted brokerage draft');
reset role;
select results_eq($$select lock_version from public.listings where id='89000000-0000-4000-8000-000000000001'$$,$$values (3)$$,'the broker save advances the same optimistic lock');

update public.listing_versions set revision_state='submitted',submitted_by_person_id=created_by_person_id,submitted_at=now(),frozen_at=now() where listing_id='89000000-0000-4000-8000-000000000001';
update public.listings set lifecycle_state='pending_initial_approval' where id='89000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_like($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',3,'manual',(select id from public.administrative_areas where code='JM-08'),'22 New Address','sale','residential',1,'Submitted overwrite','Submitted content must remain immutable while brokerage review is pending.','public','area')$$,'%Only an unsubmitted draft can be edited%','submitted content cannot be changed through the draft command');
reset role;

update public.brokerage_memberships set status='departed',ends_at=now() where id='76000000-0000-4000-8000-000000000001';
select results_eq($$select status from public.brokerage_memberships where id='76000000-0000-4000-8000-000000000001'$$,$$values ('departed'::text)$$,'the creator can leave the brokerage without deleting draft history');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_like($$insert into public.update_listing_draft_commands (listing_id,expected_lock_version,save_mode,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('89000000-0000-4000-8000-000000000001',3,'manual',(select id from public.administrative_areas where code='JM-08'),'22 New Address','sale','residential',1,'Former agent overwrite','A departed agent must not retain access to former-brokerage draft content.','public','area')$$,'%Permission denied%','a departed creator immediately loses edit access');

select * from finish();
rollback;
