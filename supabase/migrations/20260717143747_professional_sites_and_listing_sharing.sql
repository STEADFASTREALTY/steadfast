alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check check (
  event_type in (
    'listing.submitted','listing.approved','listing.changes_requested','listing.rejected',
    'inquiry.received','share.received','share.removed','share.revoked'
  )
);
alter table public.notifications drop constraint if exists notifications_target_type_check;
alter table public.notifications add constraint notifications_target_type_check
  check (target_type in ('listing','inquiry','share'));
alter table app_private.outbox_events drop constraint if exists outbox_events_aggregate_type_check;
alter table app_private.outbox_events add constraint outbox_events_aggregate_type_check
  check (aggregate_type in ('listing','inquiry','share'));

create table public.professional_sites (
  id uuid primary key default gen_random_uuid(),
  site_type text not null check (site_type in ('agent','brokerage')),
  owner_person_id uuid references public.people(id),
  owner_brokerage_id uuid references public.brokerages(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 160),
  headline text check (headline is null or char_length(headline) <= 240),
  bio text check (bio is null or char_length(bio) <= 4000),
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme)='object'),
  status text not null default 'active' check (status in ('active','paused','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (site_type='agent' and owner_person_id is not null and owner_brokerage_id is null)
    or (site_type='brokerage' and owner_person_id is null and owner_brokerage_id is not null)
  )
);
create unique index professional_sites_agent_owner_idx on public.professional_sites(owner_person_id) where owner_person_id is not null and status <> 'retired';
create unique index professional_sites_brokerage_owner_idx on public.professional_sites(owner_brokerage_id) where owner_brokerage_id is not null and status <> 'retired';

create table public.site_domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.professional_sites(id) on delete cascade,
  hostname text not null unique check (hostname ~ '^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$'),
  domain_type text not null default 'steadfast_subdomain' check (domain_type in ('steadfast_subdomain','custom')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed')),
  verified_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  check ((verification_status='verified')=(verified_at is not null))
);
create unique index site_domains_one_primary_idx on public.site_domains(site_id) where is_primary;

create table public.listing_shares (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  owner_agent_person_id uuid not null references public.people(id),
  displaying_agent_person_id uuid not null references public.people(id),
  granted_by_person_id uuid not null references public.people(id),
  ended_by_person_id uuid references public.people(id),
  status text not null default 'active' check (status in ('active','removed','revoked','ended')),
  granted_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason)<=1000),
  check (owner_agent_person_id <> displaying_agent_person_id),
  check ((status='active')=(ended_at is null))
);
create unique index listing_shares_one_active_display_idx on public.listing_shares(listing_id,displaying_agent_person_id) where status='active';
create index listing_shares_displaying_status_idx on public.listing_shares(displaying_agent_person_id,status,granted_at desc);
create index listing_shares_owner_status_idx on public.listing_shares(owner_agent_person_id,status,granted_at desc);

create table public.create_listing_share_commands (
  request_id uuid not null,
  listing_id uuid not null,
  displaying_agent_person_id uuid not null
);
create table public.end_listing_share_commands (
  listing_share_id uuid not null,
  operation text not null check (operation in ('remove','revoke')),
  reason text check (reason is null or char_length(btrim(reason))<=1000)
);

create function app_private.process_create_listing_share_command() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := app_private.current_person_id();
  snapshot public.public_listing_snapshots%rowtype;
  created_share uuid;
  created_event_id uuid;
  notification_id uuid;
begin
  if actor is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into snapshot from public.public_listing_snapshots where listing_id=new.listing_id;
  if not found or not app_private.public_listing_is_eligible(new.listing_id) then
    raise exception using errcode='22023',message='Only an active public listing can be shared';
  end if;
  if snapshot.assigned_agent_person_id <> actor
    or not app_private.has_brokerage_permission(snapshot.brokerage_id,'listing.share') then
    raise exception using errcode='42501',message='Listing is not available';
  end if;
  if new.displaying_agent_person_id=actor or not exists(
    select 1 from public.brokerage_memberships m join public.membership_roles r on r.membership_id=m.id and r.brokerage_id=m.brokerage_id
    join public.people p on p.id=m.person_id
    where m.person_id=new.displaying_agent_person_id and m.status='active' and r.role_key in ('agent','broker')
      and r.starts_at<=now() and (r.ends_at is null or r.ends_at>now()) and p.account_status='active'
  ) then raise exception using errcode='22023',message='Choose an active SteadFast agent'; end if;
  if exists(select 1 from public.audit_events where correlation_id=new.request_id and action='share.created') then return null; end if;
  insert into public.listing_shares(listing_id,owner_agent_person_id,displaying_agent_person_id,granted_by_person_id)
  values(new.listing_id,actor,new.displaying_agent_person_id,actor)
  on conflict(listing_id,displaying_agent_person_id) where status='active' do nothing returning id into created_share;
  if created_share is null then return null; end if;
  insert into public.audit_events(actor_person_id,brokerage_id,action,target_type,target_id,source,correlation_id,after_summary)
  values(actor,snapshot.brokerage_id,'share.created','share',created_share,'web',new.request_id,
    jsonb_build_object('listing_id',new.listing_id,'displaying_agent_person_id',new.displaying_agent_person_id)) returning event_id into created_event_id;
  insert into public.notifications(source_event_id,person_id,brokerage_id,event_type,title,body_safe,target_type,target_id)
  values(created_event_id,new.displaying_agent_person_id,snapshot.brokerage_id,'share.received','Listing shared with you',
    'A listing is available to display on your SteadFast agent website.','share',created_share) returning id into notification_id;
  insert into app_private.outbox_events(topic,notification_id,aggregate_type,aggregate_id,payload)
  values('notification.email.requested',notification_id,'share',created_share,
    jsonb_build_object('notification_id',notification_id,'person_id',new.displaying_agent_person_id,'event_type','share.received'));
  return null;
end $$;
create trigger process_create_listing_share_command before insert on public.create_listing_share_commands
for each row execute function app_private.process_create_listing_share_command();

create function app_private.process_end_listing_share_command() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := app_private.current_person_id(); target public.listing_shares%rowtype; next_status text; recipient uuid; created_event_id uuid;
begin
  if actor is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into target from public.listing_shares where id=new.listing_share_id and status='active' for update;
  if not found then raise exception using errcode='42501',message='Share not found'; end if;
  if new.operation='remove' and actor=target.displaying_agent_person_id then next_status:='removed'; recipient:=target.owner_agent_person_id;
  elsif new.operation='revoke' and actor=target.owner_agent_person_id then next_status:='revoked'; recipient:=target.displaying_agent_person_id;
  else raise exception using errcode='42501',message='Share not found'; end if;
  update public.listing_shares set status=next_status,ended_at=clock_timestamp(),ended_by_person_id=actor,end_reason=nullif(btrim(coalesce(new.reason,'')),'') where id=target.id;
  insert into public.audit_events(actor_person_id,action,target_type,target_id,source,correlation_id,after_summary)
  values(actor,'share.'||next_status,'share',target.id,'web',gen_random_uuid(),jsonb_build_object('status',next_status,'listing_id',target.listing_id)) returning event_id into created_event_id;
  insert into public.notifications(source_event_id,person_id,event_type,title,body_safe,target_type,target_id)
  values(created_event_id,recipient,'share.'||next_status,'Listing display changed',
    case when next_status='removed' then 'The displaying agent removed your listing from their website.' else 'A listing display share was revoked.' end,
    'share',target.id);
  return null;
end $$;
create trigger process_end_listing_share_command before insert on public.end_listing_share_commands
for each row execute function app_private.process_end_listing_share_command();

create table public.demo_data_batches (
  id uuid primary key default gen_random_uuid(), label text not null, status text not null default 'active' check(status in ('active','deleted')),
  created_at timestamptz not null default now(), delete_after timestamptz, deleted_at timestamptz
);
create table public.demo_data_records (
  batch_id uuid not null references public.demo_data_batches(id) on delete cascade, record_type text not null,
  record_id uuid not null, source_url text, source_license text, created_at timestamptz not null default now(),
  primary key(batch_id,record_type,record_id)
);

alter table public.professional_sites enable row level security;
alter table public.site_domains enable row level security;
alter table public.listing_shares enable row level security;
alter table public.create_listing_share_commands enable row level security;
alter table public.end_listing_share_commands enable row level security;
alter table public.demo_data_batches enable row level security;
alter table public.demo_data_records enable row level security;

create policy professional_sites_public_read on public.professional_sites for select to anon,authenticated using(status='active');
create policy site_domains_public_verified_read on public.site_domains for select to anon,authenticated using(verification_status='verified');
create policy listing_shares_public_active_read on public.listing_shares for select to anon,authenticated using(status='active');
create policy create_listing_share_authenticated_insert on public.create_listing_share_commands for insert to authenticated with check((select auth.uid()) is not null);
create policy end_listing_share_authenticated_insert on public.end_listing_share_commands for insert to authenticated with check((select auth.uid()) is not null);

revoke all on public.professional_sites,public.site_domains,public.listing_shares from anon,authenticated;
grant select on public.professional_sites,public.site_domains,public.listing_shares to anon,authenticated;
revoke all on public.create_listing_share_commands,public.end_listing_share_commands from anon,authenticated;
grant insert on public.create_listing_share_commands,public.end_listing_share_commands to authenticated;
revoke all on public.demo_data_batches,public.demo_data_records from anon,authenticated;
grant select,insert,update,delete on public.demo_data_batches,public.demo_data_records to service_role;
revoke all on function app_private.process_create_listing_share_command(),app_private.process_end_listing_share_command() from public,anon,authenticated;

create trigger professional_sites_touch_updated_at before update on public.professional_sites for each row execute function app_private.touch_updated_at();
comment on table public.listing_shares is 'Display permission only. It never grants listing ownership, editing, approval, or reassignment.';
comment on table public.demo_data_records is 'Service-role-only deletion ledger for explicitly tagged simulation records and their rights/source provenance.';
