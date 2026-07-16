# Identity and Brokerage Foundation

This document describes the implemented M1 database foundation for SteadFast identity, brokerage tenancy, roles, delegated permissions, invitations, and agent applications.

## Identity model

- Supabase Auth owns credentials and sessions.
- `people` is the durable SteadFast identity and is created automatically after a successful Auth user creation.
- Authorization never uses user-editable Auth metadata.
- One person can be an agent, broker staff member, and broker without duplicate accounts or professional seats.
- Removing an Auth account does not erase required business history; the Auth link becomes null.

## Brokerage tenancy

- `brokerages` is the tenant root.
- `brokerage_memberships` records current and historical relationships between people and brokerages.
- A partial unique index permits only one active brokerage membership per person in the MVP.
- Membership history is retained after a person leaves.
- A separate partial unique index permits only one active principal broker per brokerage.

## Roles and permissions

The seeded roles are:

- consumer
- agent
- broker staff
- broker
- SteadFast operations
- SteadFast administrator

Broker staff starts with no implicit brokerage-management authority. The broker delegates explicit permission keys such as `listing.review`, `agent.manage`, and `brokerage.profile`. Agent and broker roles include their approved baseline permissions. An active broker has the complete brokerage permission catalogue inside their own brokerage.

`app_private.has_brokerage_permission()` resolves authorization from the authenticated person, active membership, active roles, baseline role permissions, and explicit staff grants or denials. It is stored outside the exposed Data API schema and is used by Row Level Security policies.

## Invitations and applications

- `brokerage_invitations` stores invitation lifecycle metadata.
- Invitation token digests are server-only and are not selectable by browser roles.
- `brokerage_invitation_roles` records the intended brokerage roles without granting them before acceptance.
- `agent_applications` records draft, submitted, broker-approved, broker-denied, activated, and withdrawn states.
- Application records do not themselves grant membership or permissions.

Invitation acceptance, membership activation, permission changes, and application decisions will be implemented through validated server-side transactions that also append audit events.

## Data access rules

- Anonymous visitors can read the active brokerage directory and country catalogue.
- Authenticated people can read and edit only approved fields on their own identity and profiles.
- Agents and undelegated staff cannot enumerate another brokerage's private membership records.
- Brokers and staff with `agent.manage` can read membership and application records only for their active brokerage.
- Staff invitation access requires `staff.manage_limited`.
- Audit events are append-only for application roles.
- Every exposed M1 table has Row Level Security enabled.

## Verification

Run:

```powershell
npm run supabase:start
npm run db:verify
npx supabase db lint --local --level warning --fail-on error
npx supabase db advisors --local --type all --level warn --fail-on error
npm run supabase:stop -- --no-backup
```

The pgTAP suite validates schema existence, Auth-to-person creation, role and permission seeds, cross-brokerage isolation, explicit staff grants, broker authority, invitation token protection, audit immutability, public directory access, and the active-membership/principal-broker uniqueness indexes.

## Next implementation slice

The next slice adds the user-facing authentication and onboarding flow: sign in, registration, callback handling, account profile, broker-created invitations, agent application submission, and controlled acceptance/approval transactions.
