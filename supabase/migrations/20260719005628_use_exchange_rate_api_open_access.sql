alter table public.exchange_rate_snapshots
  drop constraint exchange_rate_snapshots_provider_check;

alter table public.exchange_rate_snapshots
  alter column provider set default 'ExchangeRate-API',
  add constraint exchange_rate_snapshots_provider_check check (provider = 'ExchangeRate-API');

comment on table public.exchange_rate_snapshots is 'Weekly USD-base daily rates from ExchangeRate-API used only to display estimated JMD listing conversions.';
