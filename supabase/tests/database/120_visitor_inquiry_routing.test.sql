begin;
select plan(43);

select has_table('public', 'inquiries', 'private inquiry records exist');
select has_table('public', 'create_inquiry_commands', 'write-only visitor inquiry boundary exists');
select has_table('public', 'inquiry_status_commands', 'write-only inquiry status boundary exists');
select hasnt_column('public', 'inquiries', 'ip_address', 'inquiries do not retain raw visitor IP addresses');

insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('5b000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inquiry.agent@example.test','',now(),'{}','{"display_name":"Inquiry Agent"}',now(),now()),
('5b000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inquiry.staff@example.test','',now(),'{}','{"display_name":"Inquiry Staff"}',now(),now()),
('5b000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inquiry.broker@example.test','',now(),'{}','{"display_name":"Inquiry Broker"}',now(),now()),
('5b000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','consumer@example.test','',now(),'{}','{"display_name":"Registered Consumer"}',now(),now());

insert into public.professional_profiles (person_id,public_slug)
select id,'inquiry-agent' from public.people
where auth_user_id='5b000000-0000-4000-8000-000000000001';

insert into public.brokerages (
  id,slug,legal_name,display_name,status,country_id
) values (
  '6b000000-0000-4000-8000-000000000001','inquiry-realty',
  'Inquiry Realty Limited','Inquiry Realty','active',
  (select id from public.countries where code='JM')
);

insert into public.brokerage_memberships (
  id,brokerage_id,person_id,status,starts_at
) values
('7b000000-0000-4000-8000-000000000001','6b000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000001'),'active',now()),
('7b000000-0000-4000-8000-000000000002','6b000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000002'),'active',now()),
('7b000000-0000-4000-8000-000000000003','6b000000-0000-4000-8000-000000000001',(select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000003'),'active',now());

insert into public.membership_roles (membership_id,brokerage_id,role_key) values
('7b000000-0000-4000-8000-000000000001','6b000000-0000-4000-8000-000000000001','agent'),
('7b000000-0000-4000-8000-000000000002','6b000000-0000-4000-8000-000000000001','broker_staff'),
('7b000000-0000-4000-8000-000000000003','6b000000-0000-4000-8000-000000000001','broker');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.create_listing_draft_commands (
  listing_id,administrative_area_id,address_line_1,purpose,property_type,
  property_subtype,price,title,description,bedrooms,bathrooms,visibility,
  public_location_precision
) values (
  '8b000000-0000-4000-8000-000000000001',
  (select id from public.administrative_areas where code='JM-02'),
  '15 Inquiry Test Road','sale','residential','house',52500000,
  'Public inquiry test home',
  'An approved active property used to verify private visitor inquiry routing.',
  3,2,'public','area'
);
insert into public.authorize_listing_media_upload_commands (
  media_id,listing_id,original_filename,declared_mime_type,
  declared_byte_size,object_path
) values (
  '9b000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001','inquiry-home.jpg',
  'image/jpeg',2500,
  '6b000000-0000-4000-8000-000000000001/8b000000-0000-4000-8000-000000000001/9b000000-0000-4000-8000-000000000001/original.jpg'
);
reset role;

update public.listing_media
set status='ready',detected_mime_type='image/jpeg',actual_byte_size=2500,
    width=1400,height=900,validated_at=now(),updated_at=now()
where id='9b000000-0000-4000-8000-000000000001';

insert into public.listing_media_derivatives
  (listing_id,media_id,variant,object_path,byte_size,width,height,content_hash)
values
  ('8b000000-0000-4000-8000-000000000001','9b000000-0000-4000-8000-000000000001','thumbnail','8b000000-0000-4000-8000-000000000001/9b000000-0000-4000-8000-000000000001/thumbnail.webp',1200,480,309,repeat('a',64)),
  ('8b000000-0000-4000-8000-000000000001','9b000000-0000-4000-8000-000000000001','card','8b000000-0000-4000-8000-000000000001/9b000000-0000-4000-8000-000000000001/card.webp',1800,960,617,repeat('b',64)),
  ('8b000000-0000-4000-8000-000000000001','9b000000-0000-4000-8000-000000000001','gallery','8b000000-0000-4000-8000-000000000001/9b000000-0000-4000-8000-000000000001/gallery.webp',2600,1400,900,repeat('c',64));

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.submit_listing_version_commands (
  request_id,listing_id,listing_version_id,expected_lock_version
) values (
  'aa100000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  (select id from public.listing_versions where listing_id='8b000000-0000-4000-8000-000000000001'),1
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
insert into public.decide_listing_review_commands (
  request_id,review_id,listing_id,listing_version_id,decision,comment
) values (
  'aa100000-0000-4000-8000-000000000002',
  'ab100000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  (select id from public.listing_versions where listing_id='8b000000-0000-4000-8000-000000000001'),
  'approved','Approved for inquiry routing tests.'
);
insert into public.activate_public_listing_commands (
  request_id,listing_id,approved_version_id,expected_lock_version,
  confirm_publication
) values (
  'aa100000-0000-4000-8000-000000000003',
  '8b000000-0000-4000-8000-000000000001',
  (select current_approved_version_id from public.listings where id='8b000000-0000-4000-8000-000000000001'),
  3,true
);
reset role;

select has_table('public','professional_sites','professional websites exist');
select has_table('public','site_domains','verified domain records exist');
select has_table('public','listing_shares','display-only listing shares exist');
select has_column('public','inquiries','source_site_id','inquiries retain their professional site source');
select has_column('public','inquiries','listing_owner_agent_person_id','inquiries retain the listing owner agent');
select has_column('public','inquiries','displaying_agent_person_id','inquiries retain the displaying agent');

insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '5b000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','display.agent@example.test','',now(),'{}',
  '{"display_name":"Display Agent"}',now(),now()
);
insert into public.professional_profiles(person_id,public_slug)
select id,'display-agent' from public.people where auth_user_id='5b000000-0000-4000-8000-000000000005';
insert into public.brokerage_memberships(id,brokerage_id,person_id,status,starts_at)
values('7b000000-0000-4000-8000-000000000005','6b000000-0000-4000-8000-000000000001',
  (select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000005'),'active',now());
insert into public.membership_roles(membership_id,brokerage_id,role_key)
values('7b000000-0000-4000-8000-000000000005','6b000000-0000-4000-8000-000000000001','agent');
insert into public.professional_sites(id,site_type,owner_person_id,slug,display_name)
values
('ad100000-0000-4000-8000-000000000001','agent',(select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000001'),'inquiry-agent-site','Inquiry Agent'),
('ad100000-0000-4000-8000-000000000002','agent',(select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000005'),'display-agent-site','Display Agent');
select set_config('test.display_agent_person_id',(select id::text from public.people where auth_user_id='5b000000-0000-4000-8000-000000000005'),false);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok(
  $$insert into public.create_listing_share_commands(request_id,listing_id,displaying_agent_person_id)
    values('ae100000-0000-4000-8000-000000000001','8b000000-0000-4000-8000-000000000001',
      current_setting('test.display_agent_person_id')::uuid)$$,
  'the assigned owner agent can create an immediate display-only share'
);
reset role;
select results_eq(
  $$select count(*)::bigint from public.listing_shares where status='active'$$,
  $$values (1::bigint)$$,
  'the listing share is active without transferring listing ownership'
);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select lives_ok(
  $$insert into public.create_inquiry_commands(
      request_id,listing_id,selected_agent_person_id,requester_name,requester_email,
      contact_preference,message,consent_version,consent_to_contact,source_surface,
      source_site_id,website
    ) values(
      'af100000-0000-4000-8000-000000000001','8b000000-0000-4000-8000-000000000001',
      current_setting('test.display_agent_person_id')::uuid,
      'Shared Site Visitor','shared-visitor@example.test','email',
      'I would like information from the agent whose website I visited.',
      'inquiry-contact-v1',true,'shared_agent_site','ad100000-0000-4000-8000-000000000002',''
    )$$,
  'a visitor can choose the displaying agent from an active shared-agent website'
);
reset role;
select results_eq(
  $$select source_site_id,listing_owner_agent_person_id,displaying_agent_person_id,selected_agent_person_id
    from public.inquiries where request_id='af100000-0000-4000-8000-000000000001'$$,
  $$select 'ad100000-0000-4000-8000-000000000002'::uuid,
      (select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000001'),
      (select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000005'),
      (select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000005')$$,
  'the inquiry preserves both agent roles and routes private contact data to the visitor choice'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select lives_ok(
  $$insert into public.end_listing_share_commands(listing_share_id,operation,reason)
    values((select id from public.listing_shares where status='active'),'remove','Removed from my website')$$,
  'the displaying agent can remove a share from their own website'
);
reset role;
select results_eq(
  $$select status from public.listing_shares$$,
  $$values ('removed'::text)$$,
  'removing a display share does not alter the underlying listing'
);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_like(
  $$select * from public.inquiries$$,
  '%permission denied%',
  'visitors cannot query stored inquiry contact details'
);
select throws_like(
  $$insert into public.create_inquiry_commands (
      request_id,listing_id,selected_agent_person_id,requester_name,
      requester_email,contact_preference,message,consent_version,
      consent_to_contact,source_surface,website
    ) values (
      gen_random_uuid(),'8b000000-0000-4000-8000-000000000001',
      gen_random_uuid(),'Visitor Person','visitor@example.test','email',
      'I would like to arrange a viewing for this property.',
      'inquiry-contact-v1',true,'marketplace',''
    )$$,
  '%Selected agent is not available%',
  'the database rejects a caller-selected agent who does not represent the listing'
);
select throws_like(
  $$insert into public.create_inquiry_commands (
      request_id,listing_id,selected_agent_person_id,requester_name,
      requester_email,contact_preference,message,consent_version,
      consent_to_contact,source_surface,website
    ) values (
      gen_random_uuid(),'8b000000-0000-4000-8000-000000000001',
      (select assigned_agent_person_id from public.public_listing_snapshots where listing_id='8b000000-0000-4000-8000-000000000001'),
      'Spam Person','spam@example.test','email','Automated unwanted inquiry content.',
      'inquiry-contact-v1',true,'marketplace','https://spam.example'
    )$$,
  '%Inquiry could not be submitted%',
  'the server-side command rejects a populated honeypot'
);
select lives_ok(
  $$insert into public.create_inquiry_commands (
      request_id,listing_id,selected_agent_person_id,requester_name,
      requester_email,requester_phone,contact_preference,message,
      consent_version,consent_to_contact,source_surface,website
    ) values (
      'ac100000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      (select assigned_agent_person_id from public.public_listing_snapshots where listing_id='8b000000-0000-4000-8000-000000000001'),
      '  Visitor Person  ','  VISITOR@EXAMPLE.TEST  ','+1 (876) 555-0100',
      'either','I would like to arrange a viewing for this property.',
      'inquiry-contact-v1',true,'marketplace',''
    )$$,
  'an anonymous visitor can submit an eligible inquiry through the command boundary'
);
select lives_ok(
  $$insert into public.create_inquiry_commands (
      request_id,listing_id,selected_agent_person_id,requester_name,
      requester_email,requester_phone,contact_preference,message,
      consent_version,consent_to_contact,source_surface,website
    ) values (
      'ac100000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      (select assigned_agent_person_id from public.public_listing_snapshots where listing_id='8b000000-0000-4000-8000-000000000001'),
      'Visitor Person','visitor@example.test','+1 (876) 555-0100',
      'either','I would like to arrange a viewing for this property.',
      'inquiry-contact-v1',true,'marketplace',''
    )$$,
  'replaying the same request identifier is idempotent'
);
select throws_like(
  $$select * from public.create_inquiry_commands$$,
  '%permission denied%',
  'public inquiry commands are write only'
);
reset role;

select results_eq(
  $$select requester_name,requester_email,requester_phone,contact_preference,
           requester_person_id is null
    from public.inquiries
    where request_id='ac100000-0000-4000-8000-000000000001'$$,
  $$values ('Visitor Person'::text,'visitor@example.test'::text,
            '+1 (876) 555-0100'::text,'either'::text,true)$$,
  'the inquiry normalizes contact details and records anonymous provenance'
);
select results_eq(
  $$select count(*)::bigint from public.inquiries
    where request_id='ac100000-0000-4000-8000-000000000001'$$,
  $$values (1::bigint)$$,
  'idempotent replay creates exactly one inquiry'
);
select results_eq(
  $$select approved_version_id=(select current_approved_version_id from public.listings where id=listing_id),
           consent_to_contact,consent_version,consent_at is not null
    from public.inquiries
    where request_id='ac100000-0000-4000-8000-000000000001'$$,
  $$values (true,true,'inquiry-contact-v1'::text,true)$$,
  'the inquiry pins approved content and preserves explicit consent evidence'
);
select results_eq(
  $$select count(*)::bigint from public.notifications
    where target_type='inquiry' and event_type='inquiry.received'
      and target_id=(select id from public.inquiries where request_id='ac100000-0000-4000-8000-000000000001')$$,
  $$values (1::bigint)$$,
  'a successful inquiry creates one agent notification'
);
select results_eq(
  $$select body_safe from public.notifications
    where target_type='inquiry' and event_type='inquiry.received'
      and target_id=(select id from public.inquiries where request_id='ac100000-0000-4000-8000-000000000001')$$,
  $$values ('A new property inquiry is waiting in your private inquiry inbox.'::text)$$,
  'the notification contains no visitor contact details or message content'
);
select results_eq(
  $$select aggregate_type,payload ? 'notification_id',payload ? 'person_id',
           payload ? 'requester_email'
    from app_private.outbox_events where aggregate_type='inquiry'
      and aggregate_id=(select id from public.inquiries where request_id='ac100000-0000-4000-8000-000000000001')$$,
  $$values ('inquiry'::text,true,true,false)$$,
  'the delivery outbox contains identifiers only'
);
select results_eq(
  $$select count(*)::bigint from public.audit_events
    where target_type='inquiry' and action='inquiry.created'
      and (after_summary::text like '%visitor@example.test%'
        or after_summary::text like '%arrange a viewing%')$$,
  $$values (0::bigint)$$,
  'audit summaries never copy visitor contact details or messages'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select lives_ok(
  $$insert into public.create_inquiry_commands (
      request_id,listing_id,selected_agent_person_id,requester_name,
      requester_email,contact_preference,message,consent_version,
      consent_to_contact,source_surface
    ) values (
      'ac100000-0000-4000-8000-000000000002',
      '8b000000-0000-4000-8000-000000000001',
      (select assigned_agent_person_id from public.public_listing_snapshots where listing_id='8b000000-0000-4000-8000-000000000001'),
      'Registered Consumer','consumer@example.test','email',
      'Please send me more details about this property.',
      'inquiry-contact-v1',true,'marketplace'
    )$$,
  'a registered consumer can submit the same protected inquiry command'
);
reset role;
select results_eq(
  $$select requester_person_id=(select id from public.people where auth_user_id='5b000000-0000-4000-8000-000000000004')
    from public.inquiries where request_id='ac100000-0000-4000-8000-000000000002'$$,
  $$values (true)$$,
  'registered consumer provenance is recorded without changing routing authority'
);

set local role anon;
insert into public.create_inquiry_commands (
  request_id,listing_id,selected_agent_person_id,requester_name,
  requester_email,contact_preference,message,consent_version,
  consent_to_contact,source_surface
) values
('ac100000-0000-4000-8000-000000000003','8b000000-0000-4000-8000-000000000001',(select assigned_agent_person_id from public.public_listing_snapshots where listing_id='8b000000-0000-4000-8000-000000000001'),'Visitor Person','visitor@example.test','email','A second valid request for property information.','inquiry-contact-v1',true,'marketplace'),
('ac100000-0000-4000-8000-000000000004','8b000000-0000-4000-8000-000000000001',(select assigned_agent_person_id from public.public_listing_snapshots where listing_id='8b000000-0000-4000-8000-000000000001'),'Visitor Person','visitor@example.test','email','A third valid request for property information.','inquiry-contact-v1',true,'marketplace');
select throws_like(
  $$insert into public.create_inquiry_commands (
      request_id,listing_id,selected_agent_person_id,requester_name,
      requester_email,contact_preference,message,consent_version,
      consent_to_contact,source_surface
    ) values (
      gen_random_uuid(),'8b000000-0000-4000-8000-000000000001',
      (select assigned_agent_person_id from public.public_listing_snapshots where listing_id='8b000000-0000-4000-8000-000000000001'),
      'Visitor Person','visitor@example.test','email',
      'A fourth repeated request that should be rate limited.',
      'inquiry-contact-v1',true,'marketplace'
    )$$,
  '%Please wait before sending another inquiry%',
  'the database rate limits repeated email and listing combinations'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq(
  $$select count(*)::bigint from public.inquiries$$,
  $$values (0::bigint)$$,
  'broker staff without inquiry permission cannot read inquiry PII'
);
select throws_like(
  $$insert into public.inquiry_status_commands (inquiry_id,operation)
    values ((select id from public.inquiries where request_id='ac100000-0000-4000-8000-000000000001'),'claim')$$,
  '%Inquiry not found%',
  'unauthorized staff cannot change an inquiry status'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq(
  $$select count(*)::bigint from public.inquiries$$,
  $$values (4::bigint)$$,
  'the selected active agent can read only their routed inquiry records'
);
select lives_ok(
  $$insert into public.inquiry_status_commands (inquiry_id,operation)
    values ((select id from public.inquiries where request_id='ac100000-0000-4000-8000-000000000001'),'claim')$$,
  'the selected agent can claim their inquiry'
);
select throws_like(
  $$update public.inquiries set status='closed',closed_at=now()
    where request_id='ac100000-0000-4000-8000-000000000001'$$,
  '%permission denied%',
  'agents cannot bypass the status command with direct updates'
);
select throws_like(
  $$select * from public.inquiry_status_commands$$,
  '%permission denied%',
  'inquiry status commands are write only'
);
reset role;

select results_eq(
  $$select status,first_viewed_at is not null,closed_at is null
    from public.inquiries where request_id='ac100000-0000-4000-8000-000000000001'$$,
  $$values ('in_progress'::text,true,true)$$,
  'claiming an inquiry records its first-viewed state'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select results_eq(
  $$select count(*)::bigint from public.inquiries$$,
  $$values (5::bigint)$$,
  'the broker can oversee every brokerage inquiry'
);
select lives_ok(
  $$insert into public.inquiry_status_commands (inquiry_id,operation)
    values ((select id from public.inquiries where request_id='ac100000-0000-4000-8000-000000000001'),'close')$$,
  'the broker can close a brokerage inquiry'
);
reset role;

select results_eq(
  $$select status,closed_at is not null from public.inquiries
    where request_id='ac100000-0000-4000-8000-000000000001'$$,
  $$values ('closed'::text,true)$$,
  'closing an inquiry records its terminal timestamp'
);
select results_eq(
  $$select count(*)::bigint from public.audit_events
    where target_type='inquiry' and action='inquiry.status_changed'$$,
  $$values (2::bigint)$$,
  'each effective inquiry status transition is audited'
);

select * from finish();
rollback;
