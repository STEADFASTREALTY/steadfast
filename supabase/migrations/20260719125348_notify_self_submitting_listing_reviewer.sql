begin;

create function app_private.create_self_reviewer_submission_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_membership public.brokerage_memberships%rowtype;
  submitted_version public.listing_versions%rowtype;
  notification_id uuid;
  notification_title text;
  notification_body text;
begin
  if new.action <> 'listing.submitted'
    or new.target_type <> 'listing'
    or new.target_id is null
    or new.brokerage_id is null
    or new.actor_person_id is null then
    return new;
  end if;

  select * into actor_membership
  from public.brokerage_memberships
  where brokerage_id = new.brokerage_id
    and person_id = new.actor_person_id
    and status = 'active'
  limit 1;
  if not found then
    return new;
  end if;

  if not (
    exists (
      select 1 from public.membership_roles as role
      where role.membership_id = actor_membership.id
        and role.role_key = 'broker'
        and role.starts_at <= now()
        and (role.ends_at is null or role.ends_at > now())
    )
    or (
      not exists (
        select 1 from public.membership_permissions as permission
        where permission.membership_id = actor_membership.id
          and permission.permission_key = 'listing.review'
          and permission.effect = 'deny'
          and permission.starts_at <= now()
          and (permission.ends_at is null or permission.ends_at > now())
      )
      and (
        exists (
          select 1 from public.membership_permissions as permission
          where permission.membership_id = actor_membership.id
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
          where role.membership_id = actor_membership.id
            and role_permission.permission_key = 'listing.review'
            and role.starts_at <= now()
            and (role.ends_at is null or role.ends_at > now())
        )
      )
    )
  ) then
    return new;
  end if;

  select * into submitted_version
  from public.listing_versions
  where id = (new.after_summary ->> 'version_id')::uuid
    and listing_id = new.target_id;

  if found and submitted_version.based_on_version_id is not null then
    notification_title := 'Listing update ready for review';
    notification_body := 'Your edited listing was submitted and is awaiting brokerage approval.';
  else
    notification_title := 'Listing ready for review';
    notification_body := 'Your listing submission is awaiting brokerage approval.';
  end if;

  insert into public.notifications (
    source_event_id, person_id, brokerage_id, event_type, title,
    body_safe, target_type, target_id, created_at
  ) values (
    new.event_id, new.actor_person_id, new.brokerage_id,
    'listing.submitted', notification_title, notification_body,
    'listing', new.target_id, new.occurred_at
  )
  on conflict (person_id, source_event_id, event_type) do nothing
  returning id into notification_id;

  if notification_id is not null then
    insert into app_private.outbox_events (
      topic, notification_id, aggregate_type, aggregate_id, payload,
      available_at
    ) values (
      'notification.email.requested', notification_id, 'listing', new.target_id,
      jsonb_build_object(
        'notification_id', notification_id,
        'person_id', new.actor_person_id,
        'event_type', 'listing.submitted'
      ),
      new.occurred_at
    );
  end if;

  return new;
end;
$$;

create trigger create_self_reviewer_submission_notification
  after insert on public.audit_events
  for each row execute function app_private.create_self_reviewer_submission_notification();

revoke all on function app_private.create_self_reviewer_submission_notification()
  from public, anon, authenticated;

comment on function app_private.create_self_reviewer_submission_notification() is
  'Notifies a submitting broker or delegated reviewer that the edited listing is awaiting a brokerage decision.';

commit;
