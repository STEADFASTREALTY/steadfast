begin;

-- Closed records are a deliberately separate, property-only projection. They
-- never contain a brokerage, agent, profile, website, or contact reference.
create table public.closed_listing_snapshots (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  approved_version_id uuid not null,
  lifecycle_state text not null check (lifecycle_state in ('withdrawn', 'sold', 'rented', 'expired', 'archived')),
  purpose text not null check (purpose in ('sale', 'long_term_rent', 'short_term_rent')),
  property_type text not null check (property_type in ('residential', 'commercial', 'land', 'development')),
  property_subtype text check (property_subtype is null or char_length(property_subtype) <= 80),
  currency char(3) not null check (currency in ('JMD', 'USD', 'CAD', 'GBP')),
  price numeric(14,2) not null check (price > 0),
  price_period text check (price_period is null or price_period in ('month', 'year', 'week', 'night')),
  title text not null check (char_length(title) between 5 and 160),
  description text not null check (char_length(description) between 20 and 10000),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 100),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms between 0 and 100),
  building_area numeric(14,2) check (building_area is null or building_area > 0),
  land_area numeric(14,2) check (land_area is null or land_area > 0),
  area_unit text check (area_unit is null or area_unit in ('sq_ft', 'sq_m', 'acre', 'hectare')),
  administrative_area_name text not null check (char_length(administrative_area_name) between 2 and 120),
  public_location_precision text not null check (public_location_precision in ('exact', 'street', 'area', 'hidden')),
  public_location_label text check (public_location_label is null or char_length(public_location_label) <= 200),
  public_latitude double precision check (public_latitude is null or public_latitude between -90 and 90),
  public_longitude double precision check (public_longitude is null or public_longitude between -180 and 180),
  closed_at timestamptz not null,
  archived_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null
);

create table public.closed_listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  approved_version_id uuid not null,
  derivative_id uuid not null references public.listing_media_derivatives(id) on delete cascade,
  variant text not null check (variant in ('thumbnail', 'card', 'gallery')),
  position smallint not null check (position between 1 and 30),
  width integer not null check (width between 1 and 1920),
  height integer not null check (height between 1 and 1920),
  created_at timestamptz not null default clock_timestamp(),
  unique (approved_version_id, derivative_id),
  unique (listing_id, variant, position)
);

create index closed_listing_snapshots_state_idx on public.closed_listing_snapshots (lifecycle_state, closed_at desc);
create index closed_listing_media_listing_idx on public.closed_listing_media (listing_id, variant, position);

alter table public.closed_listing_snapshots enable row level security;
alter table public.closed_listing_media enable row level security;

create policy closed_listing_snapshots_property_only_read
  on public.closed_listing_snapshots for select to anon, authenticated using (true);
create policy closed_listing_media_property_only_read
  on public.closed_listing_media for select to anon, authenticated using (true);

revoke all on public.closed_listing_snapshots from anon, authenticated;
grant select on public.closed_listing_snapshots to anon, authenticated;
revoke all on public.closed_listing_media from anon, authenticated;
grant select (id, listing_id, approved_version_id, derivative_id, variant, position, width, height)
  on public.closed_listing_media to anon, authenticated;

create function app_private.archive_closed_listing_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_row public.listing_versions%rowtype;
  area_row public.administrative_areas%rowtype;
  closed_time timestamptz := coalesce(new.unpublished_at, new.updated_at, clock_timestamp());
begin
  if new.lifecycle_state in ('active', 'under_offer') then
    delete from public.closed_listing_media where listing_id = new.id;
    delete from public.closed_listing_snapshots where listing_id = new.id;
    return new;
  end if;

  if new.lifecycle_state not in ('withdrawn', 'sold', 'rented', 'expired', 'archived')
    or new.current_approved_version_id is null then
    return new;
  end if;

  select * into version_row
  from public.listing_versions
  where id = new.current_approved_version_id and listing_id = new.id;
  if not found or version_row.revision_state <> 'approved' then
    return new;
  end if;

  select area.* into area_row
  from public.properties as property
  join public.property_addresses as address on address.id = property.address_id
  join public.administrative_areas as area on area.id = address.administrative_area_id
  where property.id = new.property_id;
  if not found then
    return new;
  end if;

  insert into public.closed_listing_snapshots (
    listing_id, approved_version_id, lifecycle_state, purpose, property_type,
    property_subtype, currency, price, price_period, title, description,
    bedrooms, bathrooms, building_area, land_area, area_unit,
    administrative_area_name, public_location_precision, public_location_label,
    public_latitude, public_longitude, closed_at, updated_at
  ) values (
    new.id, version_row.id, new.lifecycle_state, version_row.purpose,
    version_row.property_type, version_row.property_subtype, version_row.currency,
    version_row.price, version_row.price_period, version_row.title,
    version_row.description, version_row.bedrooms, version_row.bathrooms,
    version_row.building_area, version_row.land_area, version_row.area_unit,
    area_row.name, version_row.public_location_precision,
    version_row.public_location_label,
    case when version_row.public_location_precision <> 'hidden' and version_row.public_location is not null
      then extensions.st_y(version_row.public_location::extensions.geometry) else null end,
    case when version_row.public_location_precision <> 'hidden' and version_row.public_location is not null
      then extensions.st_x(version_row.public_location::extensions.geometry) else null end,
    closed_time, closed_time
  ) on conflict (listing_id) do update set
    approved_version_id = excluded.approved_version_id,
    lifecycle_state = excluded.lifecycle_state,
    purpose = excluded.purpose,
    property_type = excluded.property_type,
    property_subtype = excluded.property_subtype,
    currency = excluded.currency,
    price = excluded.price,
    price_period = excluded.price_period,
    title = excluded.title,
    description = excluded.description,
    bedrooms = excluded.bedrooms,
    bathrooms = excluded.bathrooms,
    building_area = excluded.building_area,
    land_area = excluded.land_area,
    area_unit = excluded.area_unit,
    administrative_area_name = excluded.administrative_area_name,
    public_location_precision = excluded.public_location_precision,
    public_location_label = excluded.public_location_label,
    public_latitude = excluded.public_latitude,
    public_longitude = excluded.public_longitude,
    closed_at = excluded.closed_at,
    archived_at = clock_timestamp(),
    updated_at = excluded.updated_at;

  delete from public.closed_listing_media where listing_id = new.id;
  insert into public.closed_listing_media (
    listing_id, approved_version_id, derivative_id, variant, position, width, height
  )
  select new.id, version_row.id, derivative.id, derivative.variant, link.position,
    derivative.width, derivative.height
  from public.listing_version_media as link
  join public.listing_media as media
    on media.id = link.media_id and media.listing_id = new.id and media.status = 'ready'
  join public.listing_media_derivatives as derivative
    on derivative.media_id = media.id and derivative.listing_id = new.id
  where link.listing_version_id = version_row.id
    and link.listing_id = new.id;

  return new;
end;
$$;

create trigger archive_closed_listing_projection
  after update of lifecycle_state on public.listings
  for each row
  execute function app_private.archive_closed_listing_projection();

-- Capture historical closed records already present when this policy is introduced.
update public.listings
set lifecycle_state = lifecycle_state
where lifecycle_state in ('withdrawn', 'sold', 'rented', 'expired', 'archived');

revoke all on function app_private.archive_closed_listing_projection() from public, anon, authenticated;

comment on table public.closed_listing_snapshots is
  'Publicly readable property-only archive for closed listings. It intentionally excludes all agent, brokerage, profile, website, and contact data.';
comment on table public.closed_listing_media is
  'Privacy-safe derivatives retained only for the public property-only archive of a closed listing.';

commit;
