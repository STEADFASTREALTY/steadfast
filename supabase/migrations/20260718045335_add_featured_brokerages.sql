create table public.platform_featured_brokerages (
  brokerage_id uuid primary key references public.brokerages(id) on delete cascade,
  display_rank integer not null unique check (display_rank between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_featured_brokerages enable row level security;
