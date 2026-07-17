create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null references public.audit_events(event_id),
  person_id uuid not null references public.people(id),
  brokerage_id uuid references public.brokerages(id),
  event_type text not null check (
    event_type in (
      'listing.submitted', 'listing.approved',
      'listing.changes_requested', 'listing.rejected'
    )
  ),
  title text not null check (char_length(title) between 1 and 160),
  body_safe text not null check (char_length(body_safe) between 1 and 600),
  target_type text not null check (target_type = 'listing'),
  target_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (person_id, source_event_id, event_type)
);

create index notifications_person_created_idx
  on public.notifications (person_id, created_at desc);
create index notifications_person_unread_idx
  on public.notifications (person_id, created_at desc)
  where read_at is null;

create table app_private.outbox_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  topic text not null check (topic = 'notification.email.requested'),
  notification_id uuid not null references public.notifications(id),
  aggregate_type text not null check (aggregate_type = 'listing'),
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  unique (topic, notification_id),
  check (completed_at is null or claimed_at is not null)
);

create index outbox_events_available_idx
  on app_private.outbox_events (available_at, id)
  where completed_at is null;

create table public.notification_read_commands (
  notification_id uuid,
  mark_all boolean not null default false,
  check (
    (mark_all and notification_id is null)
    or (not mark_all and notification_id is not null)
  )
);

create function app_private.process_notification_read_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Active person required';
  end if;

  if new.mark_all then
    update public.notifications
    set read_at = coalesce(read_at, clock_timestamp())
    where person_id = actor_person_id and read_at is null;
  else
    update public.notifications
    set read_at = coalesce(read_at, clock_timestamp())
    where id = new.notification_id and person_id = actor_person_id;

    if not found then
      raise exception using errcode = '42501', message = 'Notification not found';
    end if;
  end if;

  return null;
end;
$$;

create trigger process_notification_read_command
  before insert on public.notification_read_commands
  for each row execute function app_private.process_notification_read_command();

create function app_private.create_workflow_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient record;
  submitted_version public.listing_versions%rowtype;
  decision text;
  notification_event_type text;
  notification_title text;
  notification_body text;
  notification_id uuid;
begin
  if new.target_type <> 'listing'
    or new.target_id is null
    or new.brokerage_id is null
    or new.action not in ('listing.submitted', 'listing.reviewed') then
    return new;
  end if;

  if new.action = 'listing.submitted' then
    notification_event_type := 'listing.submitted';
    notification_title := 'Listing ready for review';
    notification_body := 'A listing submission is ready for brokerage review.';

    for recipient in
      select distinct membership.person_id
      from public.brokerage_memberships as membership
      where membership.brokerage_id = new.brokerage_id
        and membership.status = 'active'
        and membership.person_id <> new.actor_person_id
        and (
          exists (
            select 1 from public.membership_roles as role
            where role.membership_id = membership.id
              and role.role_key = 'broker'
              and role.starts_at <= now()
              and (role.ends_at is null or role.ends_at > now())
          )
          or (
            not exists (
              select 1 from public.membership_permissions as permission
              where permission.membership_id = membership.id
                and permission.permission_key = 'listing.review'
                and permission.effect = 'deny'
                and permission.starts_at <= now()
                and (permission.ends_at is null or permission.ends_at > now())
            )
            and (
              exists (
                select 1 from public.membership_permissions as permission
                where permission.membership_id = membership.id
                  and permission.permission_key = 'listing.review'
                  and permission.effect = 'allow'
                  and permission.starts_at <= now()
                  and (permission.ends_at is null or permission.ends_at > now())
              )
              or exists (
                select 1
                from public.membership_roles as role
                join public.role_permissions as role_permission
                  on role_permission.role_key = role.role_key
                where role.membership_id = membership.id
                  and role_permission.permission_key = 'listing.review'
                  and role.starts_at <= now()
                  and (role.ends_at is null or role.ends_at > now())
              )
            )
          )
        )
    loop
      insert into public.notifications (
        source_event_id, person_id, brokerage_id, event_type, title,
        body_safe, target_type, target_id, created_at
      ) values (
        new.event_id, recipient.person_id, new.brokerage_id,
        notification_event_type, notification_title, notification_body,
        'listing', new.target_id, new.occurred_at
      )
      on conflict (person_id, source_event_id, event_type) do nothing
      returning id into notification_id;

      if notification_id is not null then
        insert into app_private.outbox_events (
          topic, notification_id, aggregate_type, aggregate_id, payload,
          available_at
        ) values (
          'notification.email.requested', notification_id, 'listing',
          new.target_id,
          jsonb_build_object(
            'notification_id', notification_id,
            'person_id', recipient.person_id,
            'event_type', notification_event_type
          ),
          new.occurred_at
        );
      end if;
      notification_id := null;
    end loop;
    return new;
  end if;

  decision := new.after_summary ->> 'decision';
  if decision not in ('approved', 'changes_requested', 'rejected') then
    return new;
  end if;

  select * into submitted_version
  from public.listing_versions
  where id = (new.after_summary ->> 'version_id')::uuid
    and listing_id = new.target_id;
  if not found then
    return new;
  end if;

  notification_event_type := 'listing.' || decision;
  notification_title := case decision
    when 'approved' then 'Listing approved'
    when 'changes_requested' then 'Listing changes requested'
    else 'Listing submission rejected'
  end;
  notification_body := case decision
    when 'approved' then 'The brokerage approved the submitted listing content. Publication remains inactive until separately enabled.'
    when 'changes_requested' then 'The brokerage returned the listing for changes. Open the listing record to review the decision.'
    else 'The brokerage rejected the listing submission. Open the listing record to review the decision.'
  end;

  for recipient in
    with base_recipients as (
      select submitted_version.submitted_by_person_id as person_id
      union
      select membership.person_id
      from public.listings as listing
      join public.listing_assignments as assignment
        on assignment.id = listing.current_assignment_id
      join public.brokerage_memberships as membership
        on membership.id = assignment.agent_membership_id
      where listing.id = new.target_id
        and assignment.status = 'active'
        and membership.status = 'active'
    ), approval_reviewers as (
      select membership.person_id
      from public.brokerage_memberships as membership
      where decision = 'approved'
        and membership.brokerage_id = new.brokerage_id
        and membership.status = 'active'
        and (
          exists (
            select 1 from public.membership_roles as role
            where role.membership_id = membership.id
              and role.role_key = 'broker'
              and role.starts_at <= now()
              and (role.ends_at is null or role.ends_at > now())
          )
          or exists (
            select 1 from public.membership_permissions as permission
            where permission.membership_id = membership.id
              and permission.permission_key = 'listing.review'
              and permission.effect = 'allow'
              and permission.starts_at <= now()
              and (permission.ends_at is null or permission.ends_at > now())
          )
        )
    )
    select distinct person_id
    from (
      select person_id from base_recipients
      union all
      select person_id from approval_reviewers
    ) as recipients
    where person_id is not null and person_id <> new.actor_person_id
  loop
    insert into public.notifications (
      source_event_id, person_id, brokerage_id, event_type, title,
      body_safe, target_type, target_id, created_at
    ) values (
      new.event_id, recipient.person_id, new.brokerage_id,
      notification_event_type, notification_title, notification_body,
      'listing', new.target_id, new.occurred_at
    )
    on conflict (person_id, source_event_id, event_type) do nothing
    returning id into notification_id;

    if notification_id is not null then
      insert into app_private.outbox_events (
        topic, notification_id, aggregate_type, aggregate_id, payload,
        available_at
      ) values (
        'notification.email.requested', notification_id, 'listing',
        new.target_id,
        jsonb_build_object(
          'notification_id', notification_id,
          'person_id', recipient.person_id,
          'event_type', notification_event_type
        ),
        new.occurred_at
      );
    end if;
    notification_id := null;
  end loop;

  return new;
end;
$$;

create trigger create_workflow_notifications
  after insert on public.audit_events
  for each row execute function app_private.create_workflow_notifications();

alter table public.notifications enable row level security;
alter table public.notification_read_commands enable row level security;

create policy notifications_owner_read on public.notifications
  for select to authenticated
  using (person_id = app_private.current_person_id());

create policy notification_read_commands_authenticated_insert
  on public.notification_read_commands for insert to authenticated
  with check ((select auth.uid()) is not null);

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

revoke all on table public.notification_read_commands from anon, authenticated;
grant insert on table public.notification_read_commands to authenticated;

revoke all on table app_private.outbox_events from public, anon, authenticated;
revoke all on function app_private.process_notification_read_command()
  from public, anon, authenticated;
revoke all on function app_private.create_workflow_notifications()
  from public, anon, authenticated;

comment on table public.notifications is
  'Recipient-owned, privacy-safe in-app notifications. Target authorization is rechecked when opened.';
comment on table public.notification_read_commands is
  'Write-only command boundary for marking one or all of the current person notifications read.';
comment on table app_private.outbox_events is
  'Private, deduplicated work queue. Payloads contain identifiers only; delivery workers resolve current authorized data.';
