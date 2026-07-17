begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-public-derivatives',
  'listing-public-derivatives',
  false,
  4194304,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.listing_media_derivatives (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  media_id uuid not null,
  variant text not null check (variant in ('thumbnail', 'card', 'gallery')),
  bucket_id text not null default 'listing-public-derivatives'
    check (bucket_id = 'listing-public-derivatives'),
  object_path text not null unique check (char_length(object_path) between 1 and 400),
  mime_type text not null default 'image/webp' check (mime_type = 'image/webp'),
  byte_size integer not null check (byte_size between 1 and 4194304),
  width integer not null check (width between 1 and 1920),
  height integer not null check (height between 1 and 1920),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_id, variant),
  foreign key (media_id, listing_id) references public.listing_media(id, listing_id)
    on delete cascade
);

create index listing_media_derivatives_listing_idx
  on public.listing_media_derivatives (listing_id, media_id, variant);

create table public.public_listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  approved_version_id uuid not null,
  media_id uuid not null,
  derivative_id uuid not null references public.listing_media_derivatives(id) on delete cascade,
  variant text not null check (variant in ('thumbnail', 'card', 'gallery')),
  position smallint not null check (position between 1 and 30),
  width integer not null check (width between 1 and 1920),
  height integer not null check (height between 1 and 1920),
  created_at timestamptz not null default now(),
  unique (approved_version_id, media_id, variant),
  unique (listing_id, variant, position),
  foreign key (approved_version_id, listing_id)
    references public.listing_versions(id, listing_id) on delete cascade,
  foreign key (media_id, listing_id)
    references public.listing_media(id, listing_id) on delete cascade
);

create index public_listing_media_listing_idx
  on public.public_listing_media (listing_id, variant, position);

alter table public.listing_media_derivatives enable row level security;
alter table public.public_listing_media enable row level security;

create policy public_listing_media_safe_read
  on public.public_listing_media for select to anon, authenticated
  using (app_private.public_listing_is_eligible(listing_id));

revoke all on table public.listing_media_derivatives from anon, authenticated;
revoke all on table public.public_listing_media from anon, authenticated;
grant select (id, listing_id, approved_version_id, media_id, variant, position, width, height)
  on table public.public_listing_media to anon, authenticated;

create function app_private.require_public_listing_derivatives()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_brokerage_id uuid;
  ready_media_count integer;
  complete_media_count integer;
begin
  -- Do not reveal derivative readiness to callers who lack publication
  -- authority. The canonical activation trigger will return its bounded
  -- authorization error after this trigger yields.
  select brokerage_id into target_brokerage_id
  from public.listings where id = new.listing_id;
  if (select auth.uid()) is null
    or target_brokerage_id is null
    or not app_private.has_brokerage_permission(target_brokerage_id, 'listing.review') then
    return new;
  end if;

  select count(*)::integer into ready_media_count
  from public.listing_version_media as link
  join public.listing_media as media on media.id = link.media_id
  where link.listing_version_id = new.approved_version_id
    and link.listing_id = new.listing_id
    and media.status = 'ready';

  select count(*)::integer into complete_media_count
  from (
    select link.media_id
    from public.listing_version_media as link
    join public.listing_media as media on media.id = link.media_id
    join public.listing_media_derivatives as derivative
      on derivative.media_id = media.id and derivative.listing_id = link.listing_id
    where link.listing_version_id = new.approved_version_id
      and link.listing_id = new.listing_id
      and media.status = 'ready'
    group by link.media_id
    having count(distinct derivative.variant) = 3
  ) as complete;

  if ready_media_count < 1 or complete_media_count <> ready_media_count then
    raise exception using errcode = '55000',
      message = 'Publication requires privacy-safe derivatives for every validated image';
  end if;

  return new;
end;
$$;

create trigger ensure_public_listing_derivatives
  before insert on public.activate_public_listing_commands
  for each row execute function app_private.require_public_listing_derivatives();

create function app_private.publish_public_listing_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.public_listing_media where listing_id = new.listing_id;

  insert into public.public_listing_media (
    listing_id, approved_version_id, media_id, derivative_id,
    variant, position, width, height
  )
  select
    new.listing_id, new.approved_version_id, link.media_id, derivative.id,
    derivative.variant, link.position, derivative.width, derivative.height
  from public.listing_version_media as link
  join public.listing_media as media
    on media.id = link.media_id and media.status = 'ready'
  join public.listing_media_derivatives as derivative
    on derivative.media_id = media.id and derivative.listing_id = link.listing_id
  where link.listing_version_id = new.approved_version_id
    and link.listing_id = new.listing_id;

  return new;
end;
$$;

create trigger publish_public_listing_media
  after insert on public.public_listing_snapshots
  for each row execute function app_private.publish_public_listing_media();

create function app_private.remove_ineligible_public_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lifecycle_state not in ('active', 'under_offer') then
    delete from public.public_listing_media where listing_id = new.id;
  end if;
  return new;
end;
$$;

create trigger remove_ineligible_public_media
  after update of lifecycle_state on public.listings
  for each row
  when (old.lifecycle_state is distinct from new.lifecycle_state)
  execute function app_private.remove_ineligible_public_media();

revoke all on function app_private.require_public_listing_derivatives()
  from public, anon, authenticated;
revoke all on function app_private.publish_public_listing_media()
  from public, anon, authenticated;
revoke all on function app_private.remove_ineligible_public_media()
  from public, anon, authenticated;

comment on table public.listing_media_derivatives is
  'Server-only metadata for resized WebP derivatives. Source filenames, source metadata, and original object paths are never copied.';
comment on table public.public_listing_media is
  'Eligibility-gated public image projection. Anonymous roles can read display geometry and opaque IDs, never storage paths.';

commit;
