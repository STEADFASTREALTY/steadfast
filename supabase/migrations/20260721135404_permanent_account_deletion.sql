begin;

-- A permanent deletion removes the person record itself. Historical property
-- records may remain, but their person references are deliberately nullable so
-- no former agent, broker, email, phone number, profile, or website can be
-- reconstructed from them.
alter table public.listings alter column created_by_person_id drop not null;
alter table public.listing_versions alter column created_by_person_id drop not null;
alter table public.properties alter column created_by_person_id drop not null;
alter table public.property_addresses alter column created_by_person_id drop not null;
alter table public.listing_assignments alter column assigned_by_person_id drop not null;
alter table public.listing_media alter column uploaded_by_person_id drop not null;
alter table public.listing_reviews alter column reviewer_person_id drop not null;
alter table public.membership_permissions alter column granted_by_person_id drop not null;
alter table public.listing_shares alter column granted_by_person_id drop not null;
alter table public.inquiries alter column listing_owner_agent_person_id drop not null;
alter table public.inquiries alter column selected_agent_person_id drop not null;

-- A closed independent listing has no continuing owner. It is retained only in
-- the property-only closed archive, which has no person or contact fields.
alter table public.listings drop constraint if exists listings_owner_authority_check;
alter table public.listings add constraint listings_owner_authority_check check (
  (brokerage_id is not null and independent_owner_person_id is null)
  or (brokerage_id is null and independent_owner_person_id is not null)
  or (
    brokerage_id is null
    and independent_owner_person_id is null
    and lifecycle_state in ('withdrawn', 'sold', 'rented', 'expired', 'archived')
  )
);

-- The command table never retains a deletion request. Its before-insert trigger
-- executes the wipe and returns null, leaving no request record or account
-- identifier behind.
create table public.permanent_account_deletion_commands (
  request_id uuid primary key,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.permanent_account_deletion_commands enable row level security;
create policy permanent_account_deletion_commands_authenticated_insert
  on public.permanent_account_deletion_commands for insert to authenticated
  with check ((select auth.uid()) is not null);

create function app_private.process_permanent_account_deletion_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleting_person_id uuid;
  actor_auth_user_id uuid;
  target_listing public.listings%rowtype;
  broker_person_id uuid;
  broker_membership_id uuid;
  replacement_assignment_id uuid;
  now_at timestamptz := clock_timestamp();
begin
  deleting_person_id := app_private.current_person_id();
  if deleting_person_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select auth_user_id into actor_auth_user_id
  from public.people where id = deleting_person_id for update;
  if actor_auth_user_id is null then
    raise exception using errcode = 'P0002', message = 'This account is no longer available';
  end if;

  -- A principal broker controls a company, team, and potentially other
  -- people’s listings. That ownership must be explicitly handed over first.
  if exists (
    select 1
    from public.brokerage_memberships membership
    join public.membership_roles role on role.membership_id = membership.id
    where membership.person_id = deleting_person_id
      and membership.status = 'active'
      and role.role_key = 'broker'
      and role.ends_at is null
  ) then
    raise exception using errcode = '55000',
      message = 'Transfer or close your brokerage before permanently deleting a principal broker account';
  end if;

  if exists (
    select 1 from public.person_platform_roles
    where person_id = deleting_person_id and ends_at is null
  ) then
    raise exception using errcode = '55000',
      message = 'ProperAP staff and administrator accounts must be removed by another administrator';
  end if;

  -- A brokerage agent’s records become private brokerage inventory. The
  -- principal broker receives the ownership/assignment; active public display
  -- is paused until the broker reviews and republishes it with a valid rep.
  for target_listing in
    select distinct listing.*
    from public.listings listing
    left join public.listing_assignments assignment
      on assignment.id = listing.current_assignment_id
    where listing.brokerage_id is not null
      and (listing.created_by_person_id = deleting_person_id or assignment.agent_membership_id in (
        select id from public.brokerage_memberships where person_id = deleting_person_id
      ))
    for update of listing
  loop
    select membership.person_id, membership.id
      into broker_person_id, broker_membership_id
    from public.brokerage_memberships membership
    join public.membership_roles role on role.membership_id = membership.id
    where membership.brokerage_id = target_listing.brokerage_id
      and membership.status = 'active'
      and role.role_key = 'broker'
      and role.ends_at is null
    limit 1;

    update public.listing_assignments
      set status = 'ended', ends_at = now_at, ended_by_person_id = null,
          reason = 'Agent account permanently deleted'
      where listing_id = target_listing.id
        and status = 'active'
        and agent_membership_id in (select id from public.brokerage_memberships where person_id = deleting_person_id);

    if broker_person_id is not null then
      insert into public.listing_assignments (
        listing_id, brokerage_id, historical_brokerage_id, agent_membership_id,
        status, starts_at, assigned_by_person_id, reason
      ) values (
        target_listing.id, target_listing.brokerage_id, target_listing.brokerage_id, broker_membership_id,
        'active', now_at, broker_person_id, 'Ownership transferred after agent account deletion'
      ) returning id into replacement_assignment_id;

      update public.listings
      set created_by_person_id = broker_person_id,
          current_assignment_id = replacement_assignment_id,
          lifecycle_state = case when lifecycle_state in ('active', 'under_offer') then 'approved_inactive' else lifecycle_state end,
          published_at = case when lifecycle_state in ('active', 'under_offer') then null else published_at end,
          unpublished_at = case when lifecycle_state in ('active', 'under_offer') then now_at else unpublished_at end,
          lock_version = lock_version + 1,
          updated_at = now_at
      where id = target_listing.id;
    else
      update public.listings
      set created_by_person_id = null,
          current_assignment_id = null,
          lifecycle_state = case when lifecycle_state in ('active', 'under_offer') then 'unassigned' else lifecycle_state end,
          published_at = null,
          unpublished_at = now_at,
          lock_version = lock_version + 1,
          updated_at = now_at
      where id = target_listing.id;
    end if;

    delete from public.public_listing_media where listing_id = target_listing.id;
    delete from public.public_listing_snapshots where listing_id = target_listing.id;
  end loop;

  -- Independent-agent listings are closed rather than deleted. The closure
  -- trigger stores a property-only archive and no identity/contact details.
  delete from public.public_listing_media
    where listing_id in (select id from public.listings where independent_owner_person_id = deleting_person_id);
  delete from public.public_listing_snapshots
    where listing_id in (select id from public.listings where independent_owner_person_id = deleting_person_id);
  update public.listings
  set lifecycle_state = 'archived',
      published_at = null,
      unpublished_at = now_at,
      current_assignment_id = null,
      independent_owner_person_id = null,
      created_by_person_id = null,
      lock_version = lock_version + 1,
      updated_at = now_at
  where independent_owner_person_id = deleting_person_id;

  delete from public.public_listing_snapshots
    where assigned_agent_person_id = deleting_person_id;

  -- Remove personal communications and applications; other customers’ inquiry
  -- records remain, but no longer point to the deleted professional.
  delete from public.consumer_messages
    where sender_person_id = deleting_person_id or recipient_person_id = deleting_person_id;
  delete from public.notifications where person_id = deleting_person_id;
  delete from public.agent_applications where person_id = deleting_person_id or broker_decided_by = deleting_person_id;
  delete from public.brokerage_invitations where invited_by_person_id = deleting_person_id;
  update public.brokerage_invitations set accepted_by_person_id = null where accepted_by_person_id = deleting_person_id;
  delete from public.initiate_listing_transfer_out_commands where recipient_person_id = deleting_person_id;
  delete from public.listing_transfer_out_requests
    where initiated_by_person_id = deleting_person_id or recipient_person_id = deleting_person_id or responded_by_person_id = deleting_person_id;
  delete from public.listing_shares
    where owner_agent_person_id = deleting_person_id or displaying_agent_person_id = deleting_person_id;
  update public.listing_shares set granted_by_person_id = null where granted_by_person_id = deleting_person_id;
  update public.listing_shares set ended_by_person_id = null where ended_by_person_id = deleting_person_id;
  delete from public.inquiries where requester_person_id = deleting_person_id;
  update public.inquiries
    set listing_owner_agent_person_id = null,
        displaying_agent_person_id = null,
        selected_agent_person_id = null
    where listing_owner_agent_person_id = deleting_person_id
       or displaying_agent_person_id = deleting_person_id
       or selected_agent_person_id = deleting_person_id;

  -- Historical property and workflow records can stay only without any link to
  -- the deleted account.
  delete from public.audit_events where actor_person_id = deleting_person_id;
  update public.listing_state_events set actor_person_id = null where actor_person_id = deleting_person_id;
  update public.listing_versions
    set created_by_person_id = null, submitted_by_person_id = null
    where created_by_person_id = deleting_person_id or submitted_by_person_id = deleting_person_id;
  update public.listing_media set uploaded_by_person_id = null where uploaded_by_person_id = deleting_person_id;
  update public.listing_reviews set reviewer_person_id = null where reviewer_person_id = deleting_person_id;
  update public.listing_assignments set assigned_by_person_id = null where assigned_by_person_id = deleting_person_id;
  update public.listing_assignments set ended_by_person_id = null where ended_by_person_id = deleting_person_id;
  update public.membership_permissions set granted_by_person_id = null where granted_by_person_id = deleting_person_id;
  update public.membership_roles set granted_by_person_id = null where granted_by_person_id = deleting_person_id;
  update public.properties set created_by_person_id = null where created_by_person_id = deleting_person_id;
  update public.property_addresses
    set created_by_person_id = null, verified_by_person_id = null
    where created_by_person_id = deleting_person_id or verified_by_person_id = deleting_person_id;
  update public.brokerage_memberships
    set approved_by_person_id = null, deactivated_by_person_id = null
    where approved_by_person_id = deleting_person_id or deactivated_by_person_id = deleting_person_id;
  update public.professional_registration_requests
    set brokerage_decided_by = null, properap_decided_by = null,
        processed_by_person_id = null, payment_recorded_by_person_id = null
    where brokerage_decided_by = deleting_person_id or properap_decided_by = deleting_person_id
       or processed_by_person_id = deleting_person_id or payment_recorded_by_person_id = deleting_person_id;
  update public.person_platform_roles set granted_by_person_id = null where granted_by_person_id = deleting_person_id;

  -- An agent site is personal data. Its relational records cascade away; the
  -- server action removes its protected objects before this command runs.
  delete from public.professional_sites where owner_person_id = deleting_person_id;
  delete from public.brokerage_memberships where person_id = deleting_person_id;
  delete from public.person_platform_roles where person_id = deleting_person_id;

  -- Auth will refuse deletion while objects are owned by this user. Property
  -- media remains with the listing, but its storage ownership is anonymized.
  update storage.objects set owner = null, owner_id = null
    where owner = actor_auth_user_id or owner_id = actor_auth_user_id::text;

  delete from public.people where id = deleting_person_id;
  return null;
end;
$$;

create trigger process_permanent_account_deletion_command
  before insert on public.permanent_account_deletion_commands
  for each row execute function app_private.process_permanent_account_deletion_command();

revoke all on function app_private.process_permanent_account_deletion_command() from public, anon, authenticated;
revoke all on public.permanent_account_deletion_commands from anon, authenticated;
grant insert on public.permanent_account_deletion_commands to authenticated;

commit;
