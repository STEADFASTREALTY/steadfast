alter table public.public_listing_snapshots
  add column is_demo boolean not null default false,
  add column demo_notice text check (demo_notice is null or char_length(demo_notice) <= 500),
  add column source_url text check (source_url is null or char_length(source_url) <= 1000),
  add constraint public_listing_snapshots_demo_notice_required_check
    check ((not is_demo) or nullif(btrim(coalesce(demo_notice, '')), '') is not null);

alter table public.inquiries
  add column source_site_id uuid references public.professional_sites(id),
  add column listing_owner_agent_person_id uuid references public.people(id),
  add column displaying_agent_person_id uuid references public.people(id);
alter table public.inquiries drop constraint inquiries_source_surface_check;
alter table public.inquiries add constraint inquiries_source_surface_check
  check (source_surface in ('marketplace','agent_site','brokerage_site','shared_agent_site'));
alter table public.create_inquiry_commands drop constraint create_inquiry_commands_source_surface_check;
alter table public.create_inquiry_commands add constraint create_inquiry_commands_source_surface_check
  check (source_surface in ('marketplace','agent_site','brokerage_site','shared_agent_site'));
update public.inquiries set listing_owner_agent_person_id=selected_agent_person_id;
alter table public.inquiries alter column listing_owner_agent_person_id set not null;
alter table public.inquiries add constraint inquiries_displaying_agent_distinct_check
  check (displaying_agent_person_id is null or displaying_agent_person_id<>listing_owner_agent_person_id);
alter table public.create_inquiry_commands add column source_site_id uuid;

create or replace function app_private.process_create_inquiry_command()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  public_listing public.public_listing_snapshots%rowtype;
  source_site public.professional_sites%rowtype;
  owner_agent_id uuid;
  display_agent_id uuid;
  normalized_email text;
  normalized_phone text;
  email_hash text;
  requester_person_id uuid;
  created_inquiry_id uuid;
  created_event_id uuid;
  created_notification_id uuid;
  notify_person_id uuid;
  resolved_source_surface text := 'marketplace';
  created_at_value timestamptz := clock_timestamp();
begin
  if btrim(new.website)<>'' then raise exception using errcode='22023',message='Inquiry could not be submitted'; end if;
  select * into public_listing from public.public_listing_snapshots where listing_id=new.listing_id;
  if not found or not app_private.public_listing_is_eligible(new.listing_id) then
    raise exception using errcode='22023',message='Property is not available for inquiries';
  end if;
  owner_agent_id:=public_listing.assigned_agent_person_id;
  if new.source_site_id is null then
    if new.selected_agent_person_id<>owner_agent_id then raise exception using errcode='42501',message='Selected agent is not available for this property'; end if;
  else
    select * into source_site from public.professional_sites where id=new.source_site_id and status='active';
    if not found then raise exception using errcode='22023',message='Property website is not available'; end if;
    if source_site.site_type='brokerage' then
      resolved_source_surface := 'brokerage_site';
      if source_site.owner_brokerage_id<>public_listing.brokerage_id or new.selected_agent_person_id<>owner_agent_id then
        raise exception using errcode='42501',message='Selected agent is not available for this property';
      end if;
    elsif source_site.owner_person_id=owner_agent_id then
      resolved_source_surface := 'agent_site';
      if new.selected_agent_person_id<>owner_agent_id then raise exception using errcode='42501',message='Selected agent is not available for this property'; end if;
    else
      resolved_source_surface := 'shared_agent_site';
      select displaying_agent_person_id into display_agent_id from public.listing_shares
      where listing_id=new.listing_id and displaying_agent_person_id=source_site.owner_person_id and status='active';
      if display_agent_id is null or new.selected_agent_person_id not in (owner_agent_id,display_agent_id) then
        raise exception using errcode='42501',message='Selected agent is not available for this property';
      end if;
    end if;
  end if;
  normalized_email:=lower(btrim(new.requester_email)); normalized_phone:=nullif(btrim(coalesce(new.requester_phone,'')),'');
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode='22023',message='Enter a valid email address'; end if;
  if normalized_phone is not null and (char_length(normalized_phone) not between 7 and 30 or normalized_phone !~ '^[0-9+(). -]+$') then raise exception using errcode='22023',message='Enter a valid phone number'; end if;
  if new.contact_preference in ('phone','either') and normalized_phone is null then raise exception using errcode='22023',message='A phone number is required for the selected contact preference'; end if;
  email_hash:=encode(extensions.digest(convert_to(normalized_email,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(email_hash,0));
  if exists(select 1 from public.inquiries where request_id=new.request_id) then return null; end if;
  if (select count(*) from public.inquiries where requester_email_hash=email_hash and listing_id=new.listing_id and created_at>created_at_value-interval '1 hour')>=3 then raise exception using errcode='P0001',message='Please wait before sending another inquiry for this property'; end if;
  if (select count(*) from public.inquiries where requester_email_hash=email_hash and created_at>created_at_value-interval '24 hours')>=10 then raise exception using errcode='P0001',message='Inquiry limit reached. Please try again later'; end if;
  requester_person_id:=app_private.current_person_id();
  insert into public.inquiries(request_id,listing_id,approved_version_id,brokerage_id,selected_agent_person_id,
    listing_owner_agent_person_id,displaying_agent_person_id,source_site_id,requester_person_id,listing_title,listing_location_label,
    requester_name,requester_email,requester_email_hash,requester_phone,contact_preference,message,consent_version,
    consent_to_contact,consent_at,source_surface,created_at,updated_at)
  values(new.request_id,public_listing.listing_id,public_listing.approved_version_id,public_listing.brokerage_id,new.selected_agent_person_id,
    owner_agent_id,display_agent_id,new.source_site_id,requester_person_id,public_listing.title,
    coalesce(public_listing.public_location_label,public_listing.administrative_area_name),btrim(new.requester_name),normalized_email,email_hash,
    normalized_phone,new.contact_preference,btrim(new.message),new.consent_version,new.consent_to_contact,created_at_value,resolved_source_surface,created_at_value,created_at_value)
  on conflict(request_id) do nothing returning id into created_inquiry_id;
  if created_inquiry_id is null then return null; end if;
  insert into public.audit_events(actor_person_id,effective_role_key,brokerage_id,action,target_type,target_id,source,correlation_id,after_summary,occurred_at)
  values(requester_person_id,case when requester_person_id is null then null else 'consumer' end,public_listing.brokerage_id,
    'inquiry.created','inquiry',created_inquiry_id,'web',new.request_id,jsonb_build_object('listing_id',public_listing.listing_id,
    'selected_agent_person_id',new.selected_agent_person_id,'source_site_id',new.source_site_id),created_at_value) returning event_id into created_event_id;
  for notify_person_id in select distinct x from unnest(array[new.selected_agent_person_id,case when display_agent_id is not null and new.selected_agent_person_id<>owner_agent_id then owner_agent_id else display_agent_id end]) x where x is not null loop
    insert into public.notifications(source_event_id,person_id,brokerage_id,event_type,title,body_safe,target_type,target_id,created_at)
    values(created_event_id,notify_person_id,public_listing.brokerage_id,'inquiry.received','New property inquiry',
      case when new.source_site_id is null then 'A new property inquiry is waiting in your private inquiry inbox.' when notify_person_id=new.selected_agent_person_id then 'A visitor selected you as the primary contact for a property inquiry.' else 'A visitor inquiry was sent from a shared listing display.' end,
      'inquiry',created_inquiry_id,created_at_value) returning id into created_notification_id;
    insert into app_private.outbox_events(topic,notification_id,aggregate_type,aggregate_id,payload,available_at)
    values('notification.email.requested',created_notification_id,'inquiry',created_inquiry_id,
      jsonb_build_object('notification_id',created_notification_id,'person_id',notify_person_id,'event_type','inquiry.received'),created_at_value);
  end loop;
  return null;
end $$;
