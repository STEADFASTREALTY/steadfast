begin;
select plan(19);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('57000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','media.agent@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Media Agent"}',now(),now()),
('57000000-0000-4000-8000-000000000002','00000000-0000-0000-8000-000000000000','authenticated','authenticated','media.other@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Other Media Agent"}',now(),now()),
('57000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','media.broker@example.test','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Media Broker"}',now(),now());
insert into public.brokerages (id,slug,legal_name,display_name,status,country_id) values
('67000000-0000-4000-8000-000000000001','media-realty','Media Realty Limited','Media Realty','active',(select id from public.countries where code='JM'));
insert into public.brokerage_memberships (id,brokerage_id,person_id,status,starts_at) values
('77000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='57000000-0000-4000-8000-000000000001'),'active',now()),
('77000000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='57000000-0000-4000-8000-000000000002'),'active',now()),
('77000000-0000-4000-8000-000000000003','67000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='57000000-0000-4000-8000-000000000003'),'active',now());
insert into public.membership_roles (membership_id,brokerage_id,role_key) values
('77000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001','agent'),
('77000000-0000-4000-8000-000000000002','67000000-0000-4000-8000-000000000001','agent'),
('77000000-0000-4000-8000-000000000003','67000000-0000-4000-8000-000000000001','broker');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.create_listing_draft_commands (listing_id,administrative_area_id,address_line_1,purpose,property_type,price,title,description,bedrooms,bathrooms,visibility,public_location_precision)
values ('89000000-0000-4000-8000-000000000091',(select id from public.administrative_areas where code='JM-02'),'91 Secure Image Way','sale','residential',25000000,'Secure media test home','A private draft used to prove listing image isolation and authorization.',3,2,'public','area');
reset role;

select results_eq($$select public, file_size_limit, allowed_mime_types from storage.buckets where id='listing-originals'$$,
  $$values (false,15728640::bigint,array['image/jpeg','image/png','image/webp']::text[])$$,
  'the originals bucket is private and restricted by size and MIME type');

set local role anon;
select throws_like($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000091','visitor.jpg','image/jpeg',1000,'x')$$,'%permission denied%','visitors cannot authorize media uploads');
select throws_like($$select * from public.listing_media$$,'%permission denied%','visitors cannot read private media metadata');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_like($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000091','wrong.jpg','image/jpeg',1000,'67000000-0000-4000-8000-000000000001/89000000-0000-4000-8000-000000000091/attacker/original.jpg')$$,'%Invalid storage path%','the browser cannot choose an arbitrary object path');
select throws_ok($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000009','89000000-0000-4000-8000-000000000091','too-large.jpg','image/jpeg',15728641,'67000000-0000-4000-8000-000000000001/89000000-0000-4000-8000-000000000091/90000000-0000-4000-8000-000000000009/original.jpg')$$,'23514',null,'the database rejects oversized declared files');
select lives_ok($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000091','front-view.jpg','image/jpeg',2048,'67000000-0000-4000-8000-000000000001/89000000-0000-4000-8000-000000000091/90000000-0000-4000-8000-000000000001/original.jpg')$$,'the assigned draft agent can authorize a private image');
select results_eq($$select status,declared_mime_type,declared_byte_size from public.listing_media where id='90000000-0000-4000-8000-000000000001'$$,$$values ('awaiting_upload'::text,'image/jpeg'::text,2048::bigint)$$,'authorization creates quarantined metadata only');
select results_eq($$select position from public.listing_version_media where media_id='90000000-0000-4000-8000-000000000001'$$,$$values (1::smallint)$$,'media is ordered on the working listing version');
select throws_like($$select * from public.authorize_listing_media_upload_commands$$,'%permission denied%','media authorization commands are write only');
select throws_like($$update public.listing_media set status='ready' where id='90000000-0000-4000-8000-000000000001'$$,'%permission denied%','the browser cannot self-approve quarantined media');
select throws_like($$insert into storage.objects (bucket_id,name,owner_id) values ('listing-originals','unapproved/object.jpg','57000000-0000-4000-8000-000000000001')$$,'%row-level security%','ordinary authenticated sessions cannot bypass signed upload authorization');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_like($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000091','other.png','image/png',2048,'67000000-0000-4000-8000-000000000001/89000000-0000-4000-8000-000000000091/90000000-0000-4000-8000-000000000002/original.png')$$,'%Permission denied%','another agent in the brokerage cannot add media to an unassigned draft');
select is_empty($$select * from public.listing_media where id='90000000-0000-4000-8000-000000000001'$$,'another agent cannot read the draft image metadata');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000003','89000000-0000-4000-8000-000000000091','broker.webp','image/webp',4096,'67000000-0000-4000-8000-000000000001/89000000-0000-4000-8000-000000000091/90000000-0000-4000-8000-000000000003/original.webp')$$,'the broker can coordinate media on a brokerage draft');
select results_eq($$select position from public.listing_version_media where media_id='90000000-0000-4000-8000-000000000003'$$,$$values (2::smallint)$$,'broker media receives the next stable position');
reset role;

update public.brokerage_memberships set status='departed',ends_at=now() where id='77000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is_empty($$select * from public.listing_media where listing_id='89000000-0000-4000-8000-000000000091'$$,'a departed agent immediately loses access to former brokerage media');
select throws_like($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000005','89000000-0000-4000-8000-000000000091','departed.jpg','image/jpeg',1000,'67000000-0000-4000-8000-000000000001/89000000-0000-4000-8000-000000000091/90000000-0000-4000-8000-000000000005/original.jpg')$$,'%Permission denied%','a departed agent cannot authorize additional media');
reset role;

update public.listing_versions set revision_state='submitted',submitted_by_person_id=created_by_person_id,submitted_at=now(),frozen_at=now() where listing_id='89000000-0000-4000-8000-000000000091';
update public.listings set lifecycle_state='pending_initial_approval' where id='89000000-0000-4000-8000-000000000091';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_like($$insert into public.authorize_listing_media_upload_commands (media_id,listing_id,original_filename,declared_mime_type,declared_byte_size,object_path) values ('90000000-0000-4000-8000-000000000004','89000000-0000-4000-8000-000000000091','late.jpg','image/jpeg',1000,'67000000-0000-4000-8000-000000000001/89000000-0000-4000-8000-000000000091/90000000-0000-4000-8000-000000000004/original.jpg')$$,'%Media can only be added to an unsubmitted draft%','submitted media sets are immutable during approval');
reset role;
select throws_like($$update public.listing_media set status='validating' where id='90000000-0000-4000-8000-000000000001'$$,'%Submitted listing media is immutable%','even a privileged late validator cannot change frozen version media');

select * from finish();
rollback;
