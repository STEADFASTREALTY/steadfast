-- A person can be both the listing agent and an authorized broker. In that
-- case, preserve the agent-side notification rather than suppressing it just
-- because the decision was self-approved under a separate role.
create or replace function app_private.notify_listing_creator_on_self_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  decision text;
  submitted_by uuid;
  actor_name text;
  notification_id uuid;
  notification_title text;
  notification_body text;
begin
  if new.action <> 'listing.reviewed' or new.target_type <> 'listing' then
    return new;
  end if;

  decision := new.after_summary ->> 'decision';
  if decision not in ('approved', 'changes_requested', 'rejected') then
    return new;
  end if;

  select version.submitted_by_person_id into submitted_by
  from public.listing_versions as version
  where version.id = (new.after_summary ->> 'version_id')::uuid
    and version.listing_id = new.target_id;
  if submitted_by is distinct from new.actor_person_id then
    return new;
  end if;

  select person.display_name into actor_name
  from public.people as person
  where person.id = new.actor_person_id;
  actor_name := coalesce(actor_name, 'Your brokerage reviewer');

  notification_title := case decision
    when 'approved' then 'Listing approved by ' || actor_name
    when 'changes_requested' then 'Listing changes requested by ' || actor_name
    else 'Listing denied by ' || actor_name
  end;
  notification_body := case decision
    when 'approved' then actor_name || ' approved the submitted listing. Public activation remains a separate brokerage step.'
    when 'changes_requested' then actor_name || ' returned the listing for changes. Reason: ' || coalesce(nullif(new.reason, ''), 'Review the listing record.')
    else actor_name || ' denied the listing submission. Reason: ' || coalesce(nullif(new.reason, ''), 'Review the listing record.')
  end;

  insert into public.notifications (
    source_event_id, person_id, brokerage_id, event_type, title,
    body_safe, target_type, target_id, created_at
  ) values (
    new.event_id, new.actor_person_id, new.brokerage_id, 'listing.' || decision,
    notification_title, notification_body, 'listing', new.target_id, new.occurred_at
  ) on conflict (person_id, source_event_id, event_type) do nothing
  returning id into notification_id;

  if notification_id is not null then
    insert into app_private.outbox_events (
      topic, notification_id, aggregate_type, aggregate_id, payload, available_at
    ) values (
      'notification.email.requested', notification_id, 'listing', new.target_id,
      jsonb_build_object(
        'notification_id', notification_id,
        'person_id', new.actor_person_id,
        'event_type', 'listing.' || decision
      ), new.occurred_at
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.notify_listing_creator_on_self_review() from public;

create trigger notify_listing_creator_on_self_review_from_audit
after insert on public.audit_events
for each row execute function app_private.notify_listing_creator_on_self_review();

-- Backfill any previously suppressed self-review notices so current test and
-- production records are consistent with the new rule.
with self_reviews as (
  select
    audit.event_id,
    audit.actor_person_id as person_id,
    audit.brokerage_id,
    audit.target_id,
    audit.occurred_at,
    audit.reason,
    audit.after_summary ->> 'decision' as decision,
    coalesce(person.display_name, 'Your brokerage reviewer') as actor_name
  from public.audit_events as audit
  join public.listing_versions as version
    on version.id = (audit.after_summary ->> 'version_id')::uuid
   and version.listing_id = audit.target_id
  left join public.people as person on person.id = audit.actor_person_id
  where audit.action = 'listing.reviewed'
    and audit.target_type = 'listing'
    and audit.actor_person_id = version.submitted_by_person_id
    and audit.after_summary ->> 'decision' in ('approved', 'changes_requested', 'rejected')
), inserted as (
  insert into public.notifications (
    source_event_id, person_id, brokerage_id, event_type, title,
    body_safe, target_type, target_id, created_at
  )
  select
    event_id, person_id, brokerage_id, 'listing.' || decision,
    case decision
      when 'approved' then 'Listing approved by ' || actor_name
      when 'changes_requested' then 'Listing changes requested by ' || actor_name
      else 'Listing denied by ' || actor_name
    end,
    case decision
      when 'approved' then actor_name || ' approved the submitted listing. Public activation remains a separate brokerage step.'
      when 'changes_requested' then actor_name || ' returned the listing for changes. Reason: ' || coalesce(nullif(reason, ''), 'Review the listing record.')
      else actor_name || ' denied the listing submission. Reason: ' || coalesce(nullif(reason, ''), 'Review the listing record.')
    end,
    'listing', target_id, occurred_at
  from self_reviews
  on conflict (person_id, source_event_id, event_type) do nothing
  returning id, person_id, event_type, target_id, created_at
)
insert into app_private.outbox_events (
  topic, notification_id, aggregate_type, aggregate_id, payload, available_at
)
select
  'notification.email.requested', id, 'listing', target_id,
  jsonb_build_object('notification_id', id, 'person_id', person_id, 'event_type', event_type),
  created_at
from inserted;
