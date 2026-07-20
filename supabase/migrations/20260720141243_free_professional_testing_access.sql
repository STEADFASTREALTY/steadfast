-- Testing mode has no payment gate. Professional access remains subject to the
-- normal broker and ProperAP approval workflow.
alter table public.professional_registration_requests
  drop constraint professional_registration_requests_status_check;

alter table public.professional_registration_requests
  add constraint professional_registration_requests_status_check
  check (status in ('submitted', 'brokerage_approved', 'properap_approved', 'activated', 'denied', 'withdrawn'));

drop index if exists public.professional_registration_one_open_idx;
create unique index professional_registration_one_open_idx on public.professional_registration_requests(person_id)
  where status in ('submitted', 'brokerage_approved', 'properap_approved');
