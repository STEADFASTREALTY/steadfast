begin;

-- An independent listing owns its property/address record directly through
-- the creating person rather than through a brokerage.
alter table public.property_addresses alter column created_by_brokerage_id drop not null;
alter table public.properties alter column created_by_brokerage_id drop not null;

commit;
