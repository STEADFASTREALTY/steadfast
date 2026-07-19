alter table public.exchange_rate_snapshots
  drop constraint exchange_rate_snapshots_provider_check;

alter table public.exchange_rate_snapshots
  alter column provider set default 'Frankfurter',
  add constraint exchange_rate_snapshots_provider_check check (provider = 'Frankfurter');

comment on table public.exchange_rate_snapshots is 'Weekly USD-base reference rates from Frankfurter used only to display estimated JMD listing conversions.';
