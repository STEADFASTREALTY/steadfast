-- Mailbox state belongs only to the receiving person.  Deletion is a soft
-- delete so delivery/audit history is retained without remaining visible.
alter table public.notifications
  add column if not exists starred_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists notifications_person_starred_idx
  on public.notifications (person_id, starred_at desc, created_at desc)
  where starred_at is not null and deleted_at is null;

create index if not exists notifications_person_visible_idx
  on public.notifications (person_id, created_at desc)
  where deleted_at is null;

create table public.notification_mailbox_commands (
  notification_id uuid not null references public.notifications(id),
  operation text not null check (operation in ('star', 'unstar', 'delete')),
  created_at timestamptz not null default now()
);

alter table public.notification_mailbox_commands enable row level security;

create policy notification_mailbox_commands_authenticated_insert
  on public.notification_mailbox_commands for insert to authenticated
  with check ((select auth.uid()) is not null);

create or replace function app_private.process_notification_mailbox_command()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_person_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  actor_person_id := app_private.current_person_id();
  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'Active person required';
  end if;

  if new.operation = 'star' then
    update public.notifications
    set starred_at = coalesce(starred_at, clock_timestamp())
    where id = new.notification_id
      and person_id = actor_person_id
      and deleted_at is null;
  elsif new.operation = 'unstar' then
    update public.notifications
    set starred_at = null
    where id = new.notification_id
      and person_id = actor_person_id
      and deleted_at is null;
  else
    update public.notifications
    set deleted_at = coalesce(deleted_at, clock_timestamp())
    where id = new.notification_id
      and person_id = actor_person_id
      and deleted_at is null;
  end if;

  if not found then
    raise exception using errcode = '42501', message = 'Notification not found';
  end if;

  return null;
end;
$$;

create trigger process_notification_mailbox_command
  before insert on public.notification_mailbox_commands
  for each row execute function app_private.process_notification_mailbox_command();

revoke all on table public.notification_mailbox_commands from anon, authenticated;
grant insert on public.notification_mailbox_commands to authenticated;
revoke all on function app_private.process_notification_mailbox_command() from public;

comment on table public.notification_mailbox_commands is
  'Write-only command boundary for a recipient to star, unstar, or remove a notification from their inbox.';
