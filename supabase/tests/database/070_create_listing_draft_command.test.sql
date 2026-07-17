begin;
select plan(20);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('55000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','draft.agent@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Draft Agent"}',now(),now()),
('55000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','draft.staff@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Draft Staff"}',now(),now()),
('55000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','draft.broker@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Draft Broker"}',now(),now());

insert into public.brokerages (id,slug,legal_name,display_name,status,country_id) values
('65000000-0000-4000-8000-000000000001','draft-realty','Draft Realty Limited','Draft Realty','active',(select id from public.countries where code='JM'));
insert into public.brokerage_memberships (id,brokerage_id,person_id,status,starts_at) values
('75000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='55000000-0000-4000-8000-000000000001'),'active',now()),
('75000000-0000-4000-8000-000000000002','65000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='55000000-0000-4000-8000-000000000002'),'active',now()),
('75000000-0000-4000-8000-000000000003','65000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='55000000-0000-4000-8000-000000000003'),'active',now());
insert into public.membership_roles (membership_id,brokerage_id,role_key) values
('75000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','agent'),
('75000000-0000-4000-8000-000000000002','65000000-0000-4000-8000-000000000001','broker_staff'),
('75000000-0000-4000-8000-000000000003','65000000-0000-4000-8000-000000000001','broker');

set local role anon;
select throws_like(
  $$insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('88000000-0000-4000-8000-000000000001',(select id from public.administrative_areas where code='JM-08'),'1 Visitor Road','sale','residential',10000000,'Visitor listing','This listing must never be created by a visitor.','public','area')$$,
  '%permission denied%', 'visitors cannot create listing drafts'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_like(
  $$insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('88000000-0000-4000-8000-000000000002',(select id from public.administrative_areas where code='JM-08'),'2 Staff Road','sale','residential',10000000,'Staff listing','Staff without an agent role cannot create this listing.','public','area')$$,
  '%Active agent listing access is required%', 'staff without an agent role cannot create a listing'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok(
  $$insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,address_line_2,postal_code,purpose,property_type,property_subtype,price,title,description,bedrooms,bathrooms,building_area,land_area,area_unit,visibility,public_location_precision) values ('88000000-0000-4000-8000-000000000003',(select id from public.administrative_areas where code='JM-08'),' 20 Ocean View Drive ',' Apartment 4 ','JMCJS12','sale','residential','Apartment',42500000,'Ocean-view apartment','A bright apartment with generous living areas and views across the coast.',2,2.5,1450,0.25,'sq_ft','public','area')$$,
  'an active agent can create a complete private listing draft'
);
reset role;

select results_eq($$select lifecycle_state || ':' || (current_assignment_id is not null)::text from public.listings where id='88000000-0000-4000-8000-000000000003'$$,$$values ('draft:true'::text)$$,'the listing begins as a represented draft');
select results_eq($$select status || ':' || agent_membership_id::text from public.listing_assignments where listing_id='88000000-0000-4000-8000-000000000003'$$,$$values ('active:75000000-0000-4000-8000-000000000001'::text)$$,'the creator is assigned as the active representative');
select results_eq($$select revision_state || ':' || purpose || ':' || visibility || ':' || currency from public.listing_versions where listing_id='88000000-0000-4000-8000-000000000003'$$,$$values ('working_draft:sale:public:JMD'::text)$$,'the first version records the requested marketing settings but remains a draft');
select results_eq($$select address_line_1 || ':' || address_line_2 || ':' || normalized_address from public.property_addresses where id=(select address_id from public.properties where id=(select property_id from public.listings where id='88000000-0000-4000-8000-000000000003'))$$,$$values ('20 Ocean View Drive:Apartment 4:20 ocean view drive apartment 4 jmcjs12 saint james jamaica'::text)$$,'the exact address is trimmed and normalized inside the database');
select results_eq($$select (address_fingerprint ~ '^[0-9a-f]{64}$')::text from public.properties where id=(select property_id from public.listings where id='88000000-0000-4000-8000-000000000003')$$,$$values ('true'::text)$$,'the property receives a stable non-guessable address fingerprint');
select results_eq($$select count(*)::bigint from public.listing_state_events where listing_id='88000000-0000-4000-8000-000000000003' and from_state is null and to_state='draft'$$,$$values (1::bigint)$$,'draft creation records lifecycle history');
select results_eq($$select after_summary->>'lifecycle_state' from public.audit_events where action='listing.draft_created' and target_id='88000000-0000-4000-8000-000000000003'$$,$$values ('draft'::text)$$,'draft creation is audited without copying private form content');
select is_empty($$select * from public.create_listing_draft_commands$$,'the write-only command payload is never stored');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok(
  $$insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,address_line_2,postal_code,purpose,property_type,price,price_period,title,description,visibility,public_location_precision) values ('88000000-0000-4000-8000-000000000004',(select id from public.administrative_areas where code='JM-08'),'20 Ocean View Drive','Apartment 4','JMCJS12','long_term_rent','residential',250000,'month','Ocean-view apartment rental','The same physical property can support a separate brokerage-controlled rental listing.','professional_network','area')$$,
  'a matching brokerage property can be safely reused for another listing'
);
reset role;
select results_eq($$select count(*)::bigint from public.property_addresses where created_by_brokerage_id='65000000-0000-4000-8000-000000000001'$$,$$values (1::bigint)$$,'reusing a property does not duplicate the private address');
select results_eq($$select count(*)::bigint from public.properties where created_by_brokerage_id='65000000-0000-4000-8000-000000000001'$$,$$values (1::bigint)$$,'reusing a property does not duplicate the stable property record');
select results_eq($$select count(*)::bigint from public.listings where brokerage_id='65000000-0000-4000-8000-000000000001'$$,$$values (2::bigint)$$,'each brokerage offer remains a separate listing');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok(
  $$insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('88000000-0000-4000-8000-000000000005',(select id from public.administrative_areas where code='JM-02'),'8 Broker Avenue','sale','commercial',90000000,'Broker commercial property','A principal broker may also act as the representative for a brokerage listing.','private','hidden')$$,
  'a principal broker can act as listing creator and representative'
);
reset role;
select results_eq($$select agent_membership_id from public.listing_assignments where listing_id='88000000-0000-4000-8000-000000000005'$$,$$values ('75000000-0000-4000-8000-000000000003'::uuid)$$,'the broker listing is assigned to the broker membership');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_like(
  $$insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('88000000-0000-4000-8000-000000000006','99999999-9999-4999-8999-999999999999','9 Invalid Parish','sale','land',10000000,'Invalid parish land','This draft uses a location outside the supported Jamaican parish catalogue.','private','hidden')$$,
  '%Choose a valid Jamaican parish%', 'the command rejects an unsupported parish'
);
reset role;

update public.brokerage_memberships set status='departed',ends_at=now() where id='75000000-0000-4000-8000-000000000001';
select results_eq($$select status from public.brokerage_memberships where id='75000000-0000-4000-8000-000000000001'$$,$$values ('departed'::text)$$,'the agent membership can leave the brokerage');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_like(
  $$insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,price,title,description,visibility,public_location_precision) values ('88000000-0000-4000-8000-000000000007',(select id from public.administrative_areas where code='JM-08'),'10 Former Agent Road','sale','land',10000000,'Former agent land','A departed agent must not retain former-brokerage listing creation access.','private','hidden')$$,
  '%Active agent listing access is required%', 'a departed agent immediately loses listing creation access'
);

select * from finish();
rollback;
