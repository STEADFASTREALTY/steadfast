alter table public.notifications
  drop constraint if exists notifications_event_type_check;
alter table public.notifications
  add constraint notifications_event_type_check check (
    event_type in (
      'listing.submitted', 'listing.approved',
      'listing.changes_requested', 'listing.rejected',
      'inquiry.received'
    )
  );

alter table public.notifications
  drop constraint if exists notifications_target_type_check;
alter table public.notifications
  add constraint notifications_target_type_check check (
    target_type in ('listing', 'inquiry')
  );

alter table app_private.outbox_events
  drop constraint if exists outbox_events_aggregate_type_check;
alter table app_private.outbox_events
  add constraint outbox_events_aggregate_type_check check (
    aggregate_type in ('listing', 'inquiry')
  );

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  listing_id uuid not null references public.listings(id),
  approved_version_id uuid not null,
  brokerage_id uuid not null references public.brokerages(id),
  selected_agent_person_id uuid not null references public.people(id),
  requester_person_id uuid references public.people(id),
  listing_title text not null check (char_length(listing_title) between 3 and 180),
  listing_location_label text not null check (char_length(listing_location_label) between 2 and 240),
  requester_name text not null
    check (char_length(requester_name) between 2 and 120),
  requester_email text not null
    check (
      char_length(requester_email) between 3 and 320
      and requester_email = lower(btrim(requester_email))
      and requester_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  requester_email_hash text not null
    check (requester_email_hash ~ '^[0-9a-f]{64}$'),
  requester_phone text check (
    requester_phone is null
    or (
      char_length(requester_phone) between 7 and 30
      and requester_phone ~ '^[0-9+(). -]+$'
    )
  ),
  contact_preference text not null
    check (contact_preference in ('email', 'phone', 'either')),
  message text not null check (char_length(message) between 10 and 2000),
  consent_version text not null check (consent_version = 'inquiry-contact-v1'),
  consent_to_contact boolean not null check (consent_to_contact),
  consent_at timestamptz not null,
  source_surface text not null check (source_surface = 'marketplace'),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'closed')),
  first_viewed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (approved_version_id, listing_id)
    references public.listing_versions(id, listing_id),
  check ((status = 'closed') = (closed_at is not null))
);

create index inquiries_selected_agent_status_created_idx
  on public.inquiries (selected_agent_person_id, status, created_at desc);
create index inquiries_brokerage_status_created_idx
  on public.inquiries (brokerage_id, status, created_at desc);
create index inquiries_listing_created_idx
  on public.inquiries (listing_id, created_at desc);
create index inquiries_email_rate_limit_idx
  on public.inquiries (requester_email_hash, created_at desc);

create table public.create_inquiry_commands (
  request_id uuid not null,
  listing_id uuid not null,
  selected_agent_person_id uuid not null,
  requester_name text not null check (char_length(btrim(requester_name)) between 2 and 120),
  requester_email text not null check (char_length(btrim(requester_email)) between 3 and 320),
  requester_phone text check (
    requester_phone is null or char_length(btrim(requester_phone)) <= 30
  ),
  contact_preference text not null
    check (contact_preference in ('email', 'phone', 'either')),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  consent_version text not null check (consent_version = 'inquiry-contact-v1'),
  consent_to_contact boolean not null check (consent_to_contact),
  source_surface text not null check (source_surface = 'marketplace'),
  website text not null default '' check (char_length(website) <= 200)
);

create table public.inquiry_status_commands (
  inquiry_id uuid not null,
  operation text not null check (operation in ('claim', 'close', 'reopen'))
);

create function app_private.process_create_inquiry_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  public_listing public.public_listing_snapshots%rowtype;
  normalized_email text;
  normalized_phone text;
  email_hash text;
  requester_person_id uuid;
  created_inquiry_id uuid;
  created_event_id uuid;
  created_notification_id uuid;
  created_at_value timestamptz := clock_timestamp();
begin
  if btrim(new.website) <> '' then
    raise exception using errcode = '22023', message = 'Inquiry could not be submitted';
  end if;

  select * into public_listing
  from public.public_listing_snapshots
  where listing_id = new.listing_id;

  if not found
    or not app_private.public_listing_is_eligible(new.listing_id) then
    raise exception using errcode = '22023', message = 'Property is not available for inquiries';
  end if;

  if new.selected_agent_person_id <> public_listing.assigned_agent_person_id then
    raise exception using errcode = '42501', message = 'Selected agent is not available for this property';
  end if;

  normalized_email := lower(btrim(new.requester_email));
  normalized_phone := nullif(btrim(coalesce(new.requester_phone, '')), '');

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid email address';
  end if;
  if normalized_phone is not null
    and (
      char_length(normalized_phone) not between 7 and 30
      or normalized_phone !~ '^[0-9+(). -]+$'
    ) then
    raise exception using errcode = '22023', message = 'Enter a valid phone number';
  end if;
  if new.contact_preference in ('phone', 'either') and normalized_phone is null then
    raise exception using errcode = '22023', message = 'A phone number is required for the selected contact preference';
  end if;

  email_hash := encode(extensions.digest(convert_to(normalized_email, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(email_hash, 0));

  if exists (
    select 1
    from public.inquiries
    where request_id = new.request_id
  ) then
    return null;
  end if;

  if (
    select count(*)
    from public.inquiries
    where requester_email_hash = email_hash
      and listing_id = new.listing_id
      and created_at > created_at_value - interval '1 hour'
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'Please wait before sending another inquiry for this property';
  end if;

  if (
    select count(*)
    from public.inquiries
    where requester_email_hash = email_hash
      and created_at > created_at_value - interval '24 hours'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'Inquiry limit reached. Please try again later';
  end if;

  requester_person_id := app_private.current_person_id();

  insert into public.inquiries (
    request_id, listing_id, approved_version_id, brokerage_id,
    selected_agent_person_id, requester_person_id, listing_title,
    listing_location_label, requester_name,
    requester_email, requester_email_hash, requester_phone,
    contact_preference, message, consent_version, consent_to_contact,
    consent_at, source_surface, created_at, updated_at
  ) values (
    new.request_id, public_listing.listing_id,
    public_listing.approved_version_id, public_listing.brokerage_id,
    public_listing.assigned_agent_person_id, requester_person_id,
    public_listing.title,
    coalesce(public_listing.public_location_label, public_listing.administrative_area_name),
    btrim(new.requester_name), normalized_email, email_hash, normalized_phone,
    new.contact_preference, btrim(new.message), new.consent_version,
    new.consent_to_contact, created_at_value, new.source_surface,
    created_at_value, created_at_value
  )
  on conflict (request_id) do nothing
  returning id into created_inquiry_id;

  if created_inquiry_id is null then
    return null;
  end if;

  insert into public.audit_events (
    actor_person_id, effective_role_key, brokerage_id, action,
    target_type, target_id, source, correlation_id, after_summary,
    occurred_at
  ) values (
    requester_person_id,
    case when requester_person_id is null then null else 'consumer' end,
    public_listing.brokerage_id, 'inquiry.created', 'inquiry',
    created_inquiry_id, 'web', new.request_id,
    jsonb_build_object(
      'listing_id', public_listing.listing_id,
      'selected_agent_person_id', public_listing.assigned_agent_person_id,
      'source_surface', new.source_surface
    ),
    created_at_value
  )
  returning event_id into created_event_id;

  insert into public.notifications (
    source_event_id, person_id, brokerage_id, event_type, title,
    body_safe, target_type, target_id, created_at
  ) values (
    created_event_id, public_listing.assigned_agent_person_id,
    public_listing.brokerage_id, 'inquiry.received',
    'New property inquiry',
    'A new property inquiry is waiting in your private inquiry inbox.',
    'inquiry', created_inquiry_id, created_at_value
  )
  on conflict (person_id, source_event_id, event_type) do nothing
  returning id into created_notification_id;

  if created_notification_id is not null then
    insert into app_private.outbox_events (
      topic, notification_id, aggregate_type, aggregate_id, payload,
      available_at
    ) values (
      'notification.email.requested', created_notification_id, 'inquiry',
      created_inquiry_id,
      jsonb_build_object(
        'notification_id', created_notification_id,
        'person_id', public_listing.assigned_agent_person_id,
        'event_type', 'inquiry.received'
      ),
      created_at_value
    );
  end if;

  return null;
end;
$$;

create trigger process_create_inquiry_command
  before insert on public.create_inquiry_commands
  for each row execute function app_private.process_create_inquiry_command();

create function app_private.process_inquiry_status_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  target_inquiry public.inquiries%rowtype;
  prior_status text;
  next_status text;
  changed_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Active person required';
  end if;

  select * into target_inquiry
  from public.inquiries
  where id = new.inquiry_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Inquiry not found';
  end if;

  if not (
    app_private.has_brokerage_permission(target_inquiry.brokerage_id, 'inquiry.manage')
    or (
      target_inquiry.selected_agent_person_id = actor_person_id
      and app_private.has_brokerage_permission(target_inquiry.brokerage_id, 'inquiry.own.manage')
    )
  ) then
    raise exception using errcode = '42501', message = 'Inquiry not found';
  end if;

  prior_status := target_inquiry.status;
  next_status := case new.operation
    when 'claim' then 'in_progress'
    when 'close' then 'closed'
    when 'reopen' then 'in_progress'
  end;

  update public.inquiries
  set status = next_status,
      first_viewed_at = case
        when new.operation = 'claim' then coalesce(first_viewed_at, changed_at)
        else first_viewed_at
      end,
      closed_at = case when next_status = 'closed' then changed_at else null end,
      updated_at = changed_at
  where id = target_inquiry.id;

  if prior_status <> next_status then
    insert into public.audit_events (
      actor_person_id, effective_role_key, brokerage_id, action,
      target_type, target_id, source, correlation_id,
      before_summary, after_summary, occurred_at
    ) values (
      actor_person_id, null, target_inquiry.brokerage_id,
      'inquiry.status_changed', 'inquiry', target_inquiry.id,
      'web', gen_random_uuid(),
      jsonb_build_object('status', prior_status),
      jsonb_build_object('status', next_status),
      changed_at
    );
  end if;

  return null;
end;
$$;

create trigger process_inquiry_status_command
  before insert on public.inquiry_status_commands
  for each row execute function app_private.process_inquiry_status_command();

alter table public.inquiries enable row level security;
alter table public.create_inquiry_commands enable row level security;
alter table public.inquiry_status_commands enable row level security;

create policy inquiries_authorized_read on public.inquiries
  for select to authenticated
  using (
    app_private.has_brokerage_permission(brokerage_id, 'inquiry.manage')
    or (
      selected_agent_person_id = app_private.current_person_id()
      and app_private.has_brokerage_permission(brokerage_id, 'inquiry.own.manage')
    )
  );

create policy create_inquiry_commands_public_insert
  on public.create_inquiry_commands for insert to anon, authenticated
  with check (request_id is not null and consent_to_contact);

create policy inquiry_status_commands_authenticated_insert
  on public.inquiry_status_commands for insert to authenticated
  with check ((select auth.uid()) is not null);

revoke all on table public.inquiries from anon, authenticated;
grant select on table public.inquiries to authenticated;

revoke all on table public.create_inquiry_commands from anon, authenticated;
grant insert on table public.create_inquiry_commands to anon, authenticated;

revoke all on table public.inquiry_status_commands from anon, authenticated;
grant insert on table public.inquiry_status_commands to authenticated;

revoke all on function app_private.process_create_inquiry_command()
  from public, anon, authenticated;
revoke all on function app_private.process_inquiry_status_command()
  from public, anon, authenticated;

comment on table public.inquiries is
  'Private visitor and consumer contact requests routed to an eligible listing agent. Public roles cannot query this table.';
comment on table public.create_inquiry_commands is
  'Write-only public command boundary. The trigger revalidates listing eligibility, agent routing, consent, idempotency, and rate limits.';
comment on table public.inquiry_status_commands is
  'Write-only professional command boundary for claiming, closing, or reopening authorized inquiries.';
