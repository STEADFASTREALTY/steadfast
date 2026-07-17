# Authentication and Professional Onboarding

This document describes the implemented SteadFast authentication and brokerage-onboarding flow.

## User flow

1. A visitor creates a free account with a name, email address, and password.
2. Supabase sends an email-confirmation link using the PKCE flow.
3. The SteadFast callback exchanges the single-use code for a cookie-backed session.
4. The registered user can maintain their profile and browse active brokerages.
5. A prospective agent applies only to the brokerage that referred them.
6. A broker or staff member with `agent.manage` approves or declines the application.
7. Approval atomically creates the active brokerage membership and agent role.
8. A broker may instead create a seven-day invitation for agent, staff, or dual-role access.
9. The invitation can be accepted only by a signed-in account whose normalized email matches the invitation.

## Implemented routes

- `/register` — free consumer account registration
- `/sign-in` — email and password sign-in
- `/auth/callback` — allowlisted PKCE code exchange
- `/account` — profile, membership, and agent-application status
- `/broker/agents` — brokerage team, application decisions, and invitation creation
- `/invite/accept` — authenticated invitation acceptance

All authenticated pages are dynamic, private application surfaces and are marked not to be indexed.

## Security boundaries

- Sessions use `@supabase/ssr` cookies. The proxy refreshes claims and forwards Supabase's private/no-store response headers when cookies change.
- Protected pages and every Server Action revalidate the user on the server.
- User-editable metadata is used only to initialize a display name; it never grants authorization.
- All form input is validated at runtime with pinned Zod schemas.
- Redirect destinations are restricted to internal paths.
- Passwords, session values, invitation tokens, and secret keys are never logged or stored in browser storage by application code.
- Raw invitation tokens are shown once to the authorized creator. Only SHA-256 digests are stored.
- Invitation acceptance requires both possession of the high-entropy token and a matching signed-in email.
- Professional onboarding writes through RLS-protected, insert-only command tables.
- Private security-definer trigger functions validate the caller and execute each membership transition atomically.
- Command rows are never persisted, and application roles cannot read command payloads.
- Every submission, decision, invitation, and acceptance creates an append-only audit event.

## Current preview limitation

The platform does not yet have an outbound email provider for brokerage invitations. The authorized broker receives a one-time invitation link and must send it to the intended person through a trusted channel. Email delivery will later move to the notification outbox.

## Supabase configuration

The hosted project must have:

- Email/password sign-up enabled
- Confirm Email enabled
- Site URL set to `https://steadfast.rockhillinnovation.com`
- Exact redirect URL `https://steadfast.rockhillinnovation.com/auth/callback`
- Password requirements matching the repository configuration
- Anonymous sign-ins disabled

Production and preview environments must use separate data before pilot testing begins.

## Verification

The database suite covers authorized application submission and approval, atomic membership creation, dual-role invitation acceptance, mismatched-email rejection, non-persistence of command rows, anonymous denial, and audit-event creation. The complete suite currently contains 51 pgTAP tests.
