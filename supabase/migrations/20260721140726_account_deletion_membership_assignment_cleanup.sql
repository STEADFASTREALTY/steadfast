begin;

-- Assignment history belongs to the agent membership. If that membership is
-- permanently removed, its records must not retain a link back to the deleted
-- person. Current listings are reassigned before this cascade is reached.
alter table public.listing_assignments
  drop constraint if exists listing_assignments_agent_membership_id_fkey;
alter table public.listing_assignments
  add constraint listing_assignments_agent_membership_id_fkey
  foreign key (agent_membership_id) references public.brokerage_memberships(id)
  on delete cascade;

commit;
