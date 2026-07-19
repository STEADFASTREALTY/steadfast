-- Keep the recipient-facing decision notice attributable to the actual broker
-- or authorized brokerage staff member who made it. The source audit event,
-- review row, and immutable listing state event remain the system of record.
create or replace function app_private.enrich_listing_review_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  decision text;
  actor_name text;
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
    when 'changes_requested' then actor_name || ' returned the listing for changes. Open the listing to review the requested corrections.'
    else actor_name || ' denied the listing submission. Open the listing to review the recorded reason.'
  end;

  update public.notifications
  set title = notification_title,
      body_safe = notification_body
  where source_event_id = new.event_id
    and event_type = 'listing.' || decision;

  return new;
end;
$$;

revoke all on function app_private.enrich_listing_review_notifications() from public;

create trigger enrich_listing_review_notifications_from_audit
after insert on public.audit_events
for each row execute function app_private.enrich_listing_review_notifications();
