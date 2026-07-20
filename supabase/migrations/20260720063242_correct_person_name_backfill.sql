create or replace function app_private.name_last_part(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when position(' ' in btrim(value)) > 0 then btrim(substring(btrim(value) from position(' ' in btrim(value)) + 1))
    else 'User'
  end
$$;

update public.people
set last_name = app_private.name_last_part(display_name);

update public.people
set last_name = 'Lin'
where primary_email = 'tonylin@properap.com';

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
begin
  supplied_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New User'), 120);
  supplied_first_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''), nullif(btrim(split_part(supplied_name, ' ', 1)), ''), 'New'), 80);
  supplied_last_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''), app_private.name_last_part(supplied_name)), 80);
  insert into public.people (auth_user_id, first_name, last_name, display_name, primary_email)
  values (new.id, supplied_first_name, supplied_last_name, concat_ws(' ', supplied_first_name, supplied_last_name), nullif(lower(btrim(coalesce(new.email, ''))), ''));
  return new;
end;
$$;

revoke all on function app_private.name_last_part(text) from public, anon, authenticated;
revoke all on function app_private.handle_new_auth_user() from public, anon, authenticated;
