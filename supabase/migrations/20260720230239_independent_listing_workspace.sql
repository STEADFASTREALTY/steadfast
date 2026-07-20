begin;

-- Independent agents do not have a brokerage id. Their media remains in the
-- same private bucket and is still linked to the listing/version as before.
alter table public.listing_media alter column brokerage_id drop not null;

-- A public snapshot can be represented by either an active brokerage or an
-- active independent agent. Brokerage columns remain populated for brokerage
-- listings and are intentionally nullable only for independent listings.
alter table public.public_listing_snapshots alter column brokerage_id drop not null;
alter table public.public_listing_snapshots alter column brokerage_name drop not null;
alter table public.public_listing_snapshots alter column brokerage_slug drop not null;

create or replace function app_private.public_listing_is_eligible(target_listing_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings as listing
    join public.listing_versions as version
      on version.id = listing.current_approved_version_id
      and version.listing_id = listing.id
    join public.people as agent on agent.id = coalesce(listing.independent_owner_person_id, listing.created_by_person_id)
    where listing.id = target_listing_id
      and listing.lifecycle_state in ('active', 'under_offer')
      and listing.published_at is not null
      and version.revision_state = 'approved'
      and version.visibility = 'public'
      and version.content_hash is not null
      and agent.account_status = 'active'
      and exists (
        select 1
        from public.listing_version_media as link
        join public.listing_media as media on media.id = link.media_id
        where link.listing_version_id = version.id and media.status = 'ready'
      )
      and (
        (listing.brokerage_id is not null and exists (
          select 1 from public.brokerages as brokerage
          where brokerage.id = listing.brokerage_id and brokerage.status = 'active'
        ))
        or
        (listing.brokerage_id is null and exists (
          select 1 from public.independent_agent_profiles as profile
          where profile.person_id = listing.independent_owner_person_id and profile.status = 'active'
        ))
      )
  )
$$;

revoke all on function app_private.public_listing_is_eligible(uuid) from public;
grant execute on function app_private.public_listing_is_eligible(uuid) to anon, authenticated;

commit;
