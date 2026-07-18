alter table public.site_assets
  drop constraint if exists site_assets_placement_check;

alter table public.site_assets
  add constraint site_assets_placement_check
  check (placement in ('profile_photo', 'brokerage_logo', 'testimonial_photo', 'hero_background'));

drop index if exists public.site_assets_one_active_placement_idx;

create unique index site_assets_one_active_placement_idx
  on public.site_assets(site_id, placement)
  where status = 'ready'
    and placement in ('profile_photo', 'brokerage_logo', 'hero_background');
