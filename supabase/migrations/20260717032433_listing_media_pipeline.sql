begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-originals',
  'listing-originals',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.listing_media (
  id uuid primary key,
  listing_id uuid not null,
  brokerage_id uuid not null,
  bucket_id text not null default 'listing-originals'
    check (bucket_id = 'listing-originals'),
  object_path text not null unique
    check (char_length(object_path) between 1 and 300),
  original_filename text not null
    check (char_length(original_filename) between 1 and 180),
  declared_mime_type text not null
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  detected_mime_type text
    check (detected_mime_type is null or detected_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_byte_size bigint not null check (declared_byte_size between 1 and 15728640),
  actual_byte_size bigint check (actual_byte_size is null or actual_byte_size between 1 and 15728640),
  width integer check (width is null or width between 300 and 12000),
  height integer check (height is null or height between 300 and 12000),
  status text not null default 'awaiting_upload'
    check (status in ('awaiting_upload', 'validating', 'ready', 'rejected', 'removed')),
  rejection_code text check (rejection_code is null or rejection_code in (
    'missing_object', 'size_mismatch', 'unsupported_format', 'type_mismatch',
    'invalid_image', 'animated_image', 'dimensions_out_of_range', 'too_many_pixels',
    'validation_failed'
  )),
  uploaded_by_person_id uuid not null references public.people(id),
  upload_expires_at timestamptz not null default (now() + interval '10 minutes'),
  validated_at timestamptz,
  rejected_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (listing_id, brokerage_id) references public.listings(id, brokerage_id),
  unique (id, listing_id),
  check (
    (status = 'ready' and detected_mime_type is not null and actual_byte_size is not null
      and width is not null and height is not null and validated_at is not null
      and rejection_code is null and rejected_at is null and removed_at is null)
    or (status = 'rejected' and rejection_code is not null and rejected_at is not null
      and validated_at is null and removed_at is null)
    or (status = 'removed' and removed_at is not null)
    or (status in ('awaiting_upload', 'validating') and validated_at is null
      and rejected_at is null and removed_at is null)
  )
);

create index listing_media_listing_status_idx
  on public.listing_media (listing_id, status, created_at);
create index listing_media_upload_expiry_idx
  on public.listing_media (upload_expires_at)
  where status = 'awaiting_upload';

create function app_private.protect_listing_media_validation_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_lifecycle_state text;
begin
  if new.status in ('validating', 'ready') and old.status is distinct from new.status then
    select lifecycle_state into target_lifecycle_state
    from public.listings
    where id = old.listing_id
    for share;

    if target_lifecycle_state <> 'draft' or not exists (
      select 1
      from public.listing_version_media as link
      join public.listing_versions as version on version.id = link.listing_version_id
      where link.media_id = old.id
        and version.revision_state = 'working_draft'
    ) then
      raise exception using errcode = '55000', message = 'Submitted listing media is immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_listing_media_validation_transition
  before update on public.listing_media
  for each row execute function app_private.protect_listing_media_validation_transition();

revoke all on function app_private.protect_listing_media_validation_transition()
  from public, anon, authenticated;

create table public.listing_version_media (
  listing_version_id uuid not null,
  listing_id uuid not null,
  media_id uuid not null,
  position smallint not null check (position between 1 and 30),
  caption text check (caption is null or char_length(caption) <= 300),
  created_at timestamptz not null default now(),
  primary key (listing_version_id, media_id),
  unique (listing_version_id, position),
  foreign key (listing_version_id, listing_id)
    references public.listing_versions(id, listing_id),
  foreign key (media_id, listing_id)
    references public.listing_media(id, listing_id)
);

create index listing_version_media_listing_idx
  on public.listing_version_media (listing_id, listing_version_id, position);

alter table public.listing_media enable row level security;
alter table public.listing_version_media enable row level security;

create policy listing_media_private_read on public.listing_media
  for select to authenticated
  using (app_private.can_read_listing_private(listing_id));

create policy listing_version_media_private_read on public.listing_version_media
  for select to authenticated
  using (app_private.can_read_listing_private(listing_id));

grant select on public.listing_media, public.listing_version_media to authenticated;
revoke insert, update, delete on public.listing_media, public.listing_version_media
  from anon, authenticated;

create table public.authorize_listing_media_upload_commands (
  media_id uuid not null,
  listing_id uuid not null,
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  declared_mime_type text not null
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_byte_size bigint not null check (declared_byte_size between 1 and 15728640),
  object_path text not null check (char_length(object_path) between 1 and 300)
);

alter table public.authorize_listing_media_upload_commands enable row level security;
create policy authorize_listing_media_upload_authenticated_insert
  on public.authorize_listing_media_upload_commands
  for insert to authenticated
  with check ((select auth.uid()) is not null);

create function app_private.process_authorize_listing_media_upload_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_person_id uuid;
  target_listing public.listings%rowtype;
  target_version_id uuid;
  extension text;
  expected_path text;
  next_position smallint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Active person required';
  end if;

  select * into target_listing
  from public.listings
  where id = new.listing_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;

  if target_listing.lifecycle_state <> 'draft' then
    raise exception using errcode = '55000', message = 'Media can only be added to an unsubmitted draft';
  end if;

  if not app_private.is_active_brokerage_member(target_listing.brokerage_id)
    or not (
      target_listing.created_by_person_id = actor_person_id
      or app_private.has_brokerage_permission(target_listing.brokerage_id, 'listing.manage')
    ) then
    raise exception using errcode = '42501', message = 'Permission denied';
  end if;

  select id into target_version_id
  from public.listing_versions
  where listing_id = target_listing.id and revision_state = 'working_draft'
  order by version_number desc
  limit 1
  for update;
  if target_version_id is null then
    raise exception using errcode = '55000', message = 'Editable listing version not found';
  end if;

  extension := case new.declared_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else null
  end;
  expected_path := target_listing.brokerage_id::text || '/' || target_listing.id::text
    || '/' || new.media_id::text || '/original.' || extension;

  if new.object_path <> expected_path then
    raise exception using errcode = '22023', message = 'Invalid storage path';
  end if;

  delete from public.listing_version_media as link
  using public.listing_media as media
  where link.media_id = media.id
    and media.listing_id = target_listing.id
    and media.status = 'awaiting_upload'
    and media.upload_expires_at < now();

  update public.listing_media
  set status = 'removed', removed_at = now(), updated_at = now()
  where listing_id = target_listing.id
    and status = 'awaiting_upload'
    and upload_expires_at < now();

  if (select count(*) from public.listing_media
      where listing_id = target_listing.id and status not in ('rejected', 'removed')) >= 30 then
    raise exception using errcode = '22023', message = 'A listing can have no more than 30 images';
  end if;

  select candidate.position::smallint into next_position
  from generate_series(1, 30) as candidate(position)
  where not exists (
    select 1 from public.listing_version_media as existing
    where existing.listing_version_id = target_version_id
      and existing.position = candidate.position
  )
  order by candidate.position
  limit 1;

  insert into public.listing_media (
    id, listing_id, brokerage_id, object_path, original_filename,
    declared_mime_type, declared_byte_size, uploaded_by_person_id
  ) values (
    new.media_id, target_listing.id, target_listing.brokerage_id,
    new.object_path, btrim(new.original_filename), new.declared_mime_type,
    new.declared_byte_size, actor_person_id
  );

  insert into public.listing_version_media (
    listing_version_id, listing_id, media_id, position
  ) values (target_version_id, target_listing.id, new.media_id, next_position);

  return null;
end;
$$;

create trigger process_authorize_listing_media_upload_command
  before insert on public.authorize_listing_media_upload_commands
  for each row execute function app_private.process_authorize_listing_media_upload_command();

revoke all on function app_private.process_authorize_listing_media_upload_command()
  from public, anon, authenticated;
revoke all on public.authorize_listing_media_upload_commands from anon, authenticated;
grant insert on public.authorize_listing_media_upload_commands to authenticated;

comment on table public.listing_media is
  'Private listing-image metadata. Original objects remain quarantined until server-side signature and dimension validation succeeds.';
comment on table public.listing_version_media is
  'Ordered media frozen with a listing version; direct browser mutation is prohibited.';
comment on table public.authorize_listing_media_upload_commands is
  'Write-only listing-scoped authorization boundary for short-lived signed uploads; command rows are never stored.';

commit;
