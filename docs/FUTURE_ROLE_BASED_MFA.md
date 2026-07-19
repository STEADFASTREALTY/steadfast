# Future Role-Based Multi-Factor Authentication

Status: planned for a future release. This document does not authorize or implement an MFA policy change.

## Purpose

ProperAP will eventually require authenticator-based multi-factor authentication (MFA) for every professional or internal account while keeping it optional for ordinary property-search users.

The objective is to protect listings, approvals, brokerage membership, inquiries, payments, account administration, and platform-management functions when a password is stolen or reused.

ProperAP uses Supabase Auth's time-based one-time password (TOTP) capability. Supabase currently makes the TOTP MFA API available on all projects, including the Free plan. Users provide the second factor through a compatible authenticator application; ProperAP does not need to create or operate an authenticator application.

Reference: <https://supabase.com/docs/guides/auth/auth-mfa/totp>

## Planned policy

| Account level | Planned MFA requirement |
| --- | --- |
| Visitor | Not applicable |
| Registered consumer | Optional |
| Agent | Required |
| Broker staff | Required |
| Broker | Required |
| ProperAP operations or management | Required |
| ProperAP administrator | Required |

An account with more than one role follows the strictest requirement. For example, a consumer who becomes an agent must enroll MFA before using professional features.

## Current implementation

The repository already contains the foundation for TOTP enrollment and verification:

- `app/components/mfa-enrollment.tsx` enrolls a TOTP factor, displays the QR code and setup key, and verifies the first six-digit code.
- `app/components/mfa-challenge.tsx` challenges and verifies an enrolled factor.
- `app/mfa/setup/page.tsx` provides the required-enrollment page.
- `app/mfa/challenge/page.tsx` provides the second-factor challenge page.
- `app/account/security/page.tsx` allows an authenticated user to enroll an authenticator or add a backup authenticator.
- `lib/auth/session.ts` checks Supabase's Authenticator Assurance Level (AAL).

The current enforcement is limited. `requireInternalMfa` applies only to the internal platform-role keys `steadfast_operations` and `steadfast_admin`, and only where that helper is explicitly called. Agents, brokers, and broker staff are not currently required to use MFA.

The following capabilities are incomplete and must be finished before broad enforcement:

- Viewing and naming every enrolled factor
- Removing a selected factor safely
- Preventing a required user from removing their last verified factor
- A complete lost-device and administrator-assisted recovery process
- Notifications and audit events for enrollment, removal, and recovery
- Consistent enforcement across pages, Server Actions, APIs, storage operations, and database policies

## Required user flows

### First enrollment

1. The user signs in with email and password, creating an `aal1` session.
2. ProperAP resolves active brokerage and platform roles from trusted database records.
3. If any active role requires MFA and no verified TOTP factor exists, ProperAP redirects to `/mfa/setup`.
4. Supabase creates a TOTP enrollment and returns a QR code and setup key.
5. The user scans the QR code with a compatible authenticator application.
6. The user enters the current six-digit code.
7. ProperAP challenges and verifies the factor through Supabase.
8. Supabase upgrades the session to `aal2`.
9. ProperAP records an audit event and returns the user to the intended professional page.

### Later sign-ins

1. Email and password establish an `aal1` session.
2. ProperAP detects a verified factor and a role that requires MFA.
3. ProperAP redirects to `/mfa/challenge`.
4. A correct current code upgrades the session to `aal2`.
5. The user continues to the requested professional page.

### Backup authenticator

Required users should be strongly encouraged to enroll a second authenticator on a separate protected device. ProperAP should show factor name, enrollment date, and last-used date where Supabase exposes that information safely.

### Removing an authenticator

Removal must require a recent `aal2` session and a custom ProperAP confirmation prompt. A user subject to required MFA cannot remove the final verified factor. Removal creates an audit event and a security notification.

### Lost device and recovery

Supabase TOTP does not provide recovery codes. The future process must therefore support:

- Verification with a previously enrolled backup authenticator
- Identity verification by authorized ProperAP personnel when every factor is unavailable
- A tightly controlled factor-reset operation with reason, operator identity, timestamp, and audit history
- Revocation of other sessions after recovery
- Notification to the account's verified email address

Brokerage staff must not be able to reset MFA for other users. Recovery should be restricted to specifically authorized ProperAP security administrators.

## Enforcement architecture

### Trusted role resolution

MFA requirements must be based on active brokerage memberships, assigned role records, and platform roles stored by ProperAP. User-editable metadata must never decide whether MFA is required.

### Central server guard

Replace the narrow internal-only helper with a central policy function that:

1. Resolves the authenticated account and its active roles.
2. Determines whether the strictest role requires MFA.
3. Calls `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`.
4. Allows protected work only when `currentLevel` is `aal2`.
5. Redirects to setup or challenge while preserving an allowlisted internal destination.

Every professional page must call this guard on the server. Middleware may improve navigation, but it must not be the only enforcement layer.

### Server Actions and APIs

Every mutation involving professional or internal work must independently require an authenticated `aal2` session. This includes, at minimum:

- Creating, submitting, editing, approving, rejecting, activating, withdrawing, or deleting a listing
- Uploading, replacing, selecting, or deleting listing media
- Managing brokerage membership, roles, permissions, invitations, suspensions, or removals
- Managing listing shares and inquiries
- Changing professional websites, logos, photographs, banners, testimonials, or public contact details
- Managing recommendations, subscriptions, payments, or ProperAP administration

Hiding a button or redirecting a page is not sufficient authorization.

### Database and storage controls

Sensitive Supabase Row Level Security policies should require both the existing ownership or permission predicate and an `aal2` assurance claim for professional mutations. Read access should remain no broader than the existing role model.

Policies must be reviewed table by table. Adding `TO authenticated` alone is not authorization, and MFA checks must not replace brokerage ownership and permission checks.

Storage policies for protected uploads must enforce the same ownership, role, and assurance requirements as the related database record.

### Role changes

When a consumer receives an agent, staff, broker, operations, or administrator role, professional access remains blocked until MFA enrollment succeeds. Removing the final MFA-required role may make MFA optional, but existing factors should remain enrolled until the user explicitly removes them.

Suspended professional users remain subject to MFA when opening any permitted professional read-only surface.

## Notifications and audit records

Record append-only events for:

- MFA enrollment started
- MFA factor verified
- Backup factor added
- Factor removed
- Failed or rate-limited challenge when appropriate
- Recovery requested
- Recovery approved or denied
- Factor reset by an administrator
- Sessions revoked after recovery

Audit records must identify the affected account, acting user, action, timestamp, request context, and administrator-provided reason without storing TOTP secrets or six-digit codes.

Security notifications should be sent to the affected user after enrollment, factor removal, recovery, or administrator reset.

## Rollout plan

### Phase 1: Complete factor management

- Add factor list and selected-factor removal
- Add clear active, required, and backup states
- Add security notifications and audit events
- Replace remaining legacy brand text with ProperAP
- Document the support and recovery procedure

### Phase 2: Internal pilot

- Require MFA for ProperAP operations and administrators across every internal route and mutation
- Test backup enrollment, lost-device recovery, and session revocation
- Review logs and support burden

### Phase 3: Brokerage pilot

- Enable the requirement for selected pilot brokers and broker staff
- Provide advance notice and a setup deadline
- Confirm mobile and desktop usability with multiple authenticator applications

### Phase 4: All professionals

- Require MFA for every agent, broker staff member, broker, operations user, and administrator
- Block professional actions from `aal1` sessions
- Monitor enrollment completion, failed challenges, recovery requests, and suspicious activity

Consumers remain optional unless the business later approves a different policy.

## Testing requirements

Automated and manual tests must cover:

- Consumer access without MFA
- Agent, broker staff, broker, operations, and administrator redirection to setup when no factor exists
- Redirection to challenge when a factor exists but the session is `aal1`
- Successful upgrade to `aal2`
- Invalid, expired, malformed, and repeatedly attempted codes
- Preservation and validation of the intended return path
- Direct Server Action and API attempts from `aal1` sessions
- Direct database and storage attempts without the required assurance and permission
- Dual-role users and role transitions
- Suspension and removal from a brokerage
- Addition and removal of backup factors
- Prevention of last-factor removal for required users
- Lost-device recovery, administrator authorization, audit events, notifications, and session revocation
- Multiple browsers, devices, and subdomains

## Acceptance criteria

The future MFA rollout is complete only when:

1. Every professional and internal role requires an `aal2` session before protected work.
2. Registered consumers can continue browsing and using consumer features without mandatory MFA.
3. Enforcement exists on pages, Server Actions, APIs, database policies, and storage policies.
4. Required users cannot remove their last verified factor.
5. Backup enrollment and lost-device recovery are documented and tested.
6. Security-sensitive MFA events are audited and notify the affected user.
7. No TOTP secret, QR payload, six-digit code, session token, or service key is logged.
8. The production rollout includes monitoring, rollback criteria, and customer support instructions.

## Deferred decision

No date has been approved for role-based MFA enforcement. Until a future implementation is reviewed and authorized, the existing optional experience and limited internal enforcement remain unchanged.
