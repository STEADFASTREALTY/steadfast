begin;

alter table public.professional_registration_requests
  add column if not exists agent_mode text;
update public.professional_registration_requests
set agent_mode = 'brokerage'
where request_type = 'agent' and agent_mode is null;
alter table public.professional_registration_requests
  alter column agent_mode drop default,
  drop constraint if exists professional_registration_requests_check;
alter table public.professional_registration_requests
  add constraint professional_registration_requests_authority_check check (
    (request_type = 'agent' and agent_mode = 'brokerage' and brokerage_id is not null and brokerage_name is null)
    or (request_type = 'agent' and agent_mode = 'independent' and brokerage_id is null and brokerage_name is null)
    or (request_type = 'broker' and agent_mode is null and brokerage_id is null and brokerage_name is not null)
  );

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_name text;
  supplied_first_name text;
  supplied_last_name text;
  requested_role text;
  agent_mode_value text;
  target_person_id uuid;
  target_brokerage_id uuid;
  brokerage_name_value text;
  phone_value text;
  address_value text;
begin
  supplied_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New User'), 120);
  supplied_first_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), nullif(btrim(split_part(supplied_name, ' ', 1)), ''), 'New'), 80);
  supplied_last_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), app_private.name_last_part(supplied_name)), 80);
  requested_role := coalesce(nullif(btrim(lower(new.raw_user_meta_data ->> 'requested_role')), ''), 'consumer');
  if requested_role not in ('consumer', 'agent', 'broker') then requested_role := 'consumer'; end if;
  agent_mode_value := coalesce(nullif(btrim(lower(new.raw_user_meta_data ->> 'agent_mode')), ''), 'brokerage');
  if agent_mode_value not in ('brokerage', 'independent') then agent_mode_value := 'brokerage'; end if;

  insert into public.people (auth_user_id, first_name, last_name, display_name, primary_email, primary_phone, account_status)
  values (new.id, supplied_first_name, supplied_last_name, concat_ws(' ', supplied_first_name, supplied_last_name), nullif(lower(btrim(coalesce(new.email, ''))), ''), nullif(btrim(new.raw_user_meta_data ->> 'contact_phone'), ''), case when requested_role = 'consumer' then 'active' else 'inactive' end)
  returning id into target_person_id;

  if requested_role = 'consumer' then
    insert into public.person_subscription_records (person_id, plan_key, status, billing_period, amount_cents, currency, starts_at, provider)
    values (target_person_id, 'consumer_free', 'free', 'none', 0, 'USD', now(), 'properap');
  end if;

  if requested_role in ('agent', 'broker') then
    phone_value := nullif(btrim(new.raw_user_meta_data ->> 'contact_phone'), '');
    address_value := nullif(btrim(new.raw_user_meta_data ->> 'contact_address'), '');
    if phone_value is null or address_value is null then
      raise exception 'Professional registration requires a phone number and address';
    end if;
    if requested_role = 'agent' and agent_mode_value = 'independent' then
      insert into public.professional_registration_requests (person_id, request_type, agent_mode, contact_phone, contact_address)
      values (target_person_id, 'agent', 'independent', phone_value, address_value);
      insert into public.independent_agent_profiles (person_id, status)
      values (target_person_id, 'pending');
    elsif requested_role = 'agent' then
      if coalesce(new.raw_user_meta_data ->> 'brokerage_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'Agent registration requires a brokerage or independent-agent selection';
      end if;
      target_brokerage_id := (new.raw_user_meta_data ->> 'brokerage_id')::uuid;
      if not exists (select 1 from public.brokerages where id = target_brokerage_id and status = 'active') then
        raise exception 'Selected brokerage is not accepting registrations';
      end if;
      insert into public.professional_registration_requests (person_id, request_type, agent_mode, brokerage_id, contact_phone, contact_address)
      values (target_person_id, 'agent', 'brokerage', target_brokerage_id, phone_value, address_value);
      insert into public.agent_applications (person_id, brokerage_id, status, submitted_at)
      values (target_person_id, target_brokerage_id, 'submitted', now());
    else
      brokerage_name_value := nullif(btrim(new.raw_user_meta_data ->> 'brokerage_name'), '');
      if brokerage_name_value is null then raise exception 'Broker registration requires a brokerage name'; end if;
      insert into public.professional_registration_requests (person_id, request_type, brokerage_name, contact_phone, contact_address)
      values (target_person_id, 'broker', brokerage_name_value, phone_value, address_value);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;

commit;
