# Visitor inquiry routing

Status: implemented for the SteadFast marketplace and professional workspace.

## Product behavior

Every active public listing presents a private contact form for its currently assigned listing representative. Visitors and signed-in consumers can provide their name, email, optional phone number, response preference, and property question. The page identifies the representative and brokerage without exposing private agent contact details.

The database rechecks the active public snapshot, approved version, brokerage, and agent assignment when the form is submitted. A browser-provided agent identifier cannot reroute an inquiry. If the listing or representative is no longer eligible, the complete request fails closed.

Agents see only inquiries assigned to them. A broker, or brokerage staff with `inquiry.manage`, can see the brokerage queue. Staff without inquiry permission cannot read contact details. SteadFast operations and administration do not receive inquiry access merely because they hold a platform role.

Professionals can move an inquiry through `new`, `in_progress`, and `closed`. Closing keeps the private history and reopening is supported. Status changes use a write-only command boundary and recheck current membership and permissions.

## Privacy and security controls

- The public browser can insert only into `create_inquiry_commands`; it cannot select the command or inquiry tables.
- Server and database validation bound every value, normalize email and phone fields, require explicit contact consent, and reject a populated honeypot.
- Contact preference `phone` or `either` requires a valid phone number.
- A random request identifier makes browser retries idempotent.
- A SHA-256 email digest supports limits of three requests per property per hour and ten requests per email per day. The raw IP address is not retained.
- Stored inquiries pin the approved listing version, public title, and public location shown when consent was given.
- Notifications and delivery outbox payloads contain identifiers and safe workflow text only. Visitor contact details and messages never appear in notification bodies, audit summaries, or public projections.
- React renders visitor content as escaped text. No visitor HTML is accepted or rendered.
- Private pages are dynamic and carry `noindex`, `nofollow`, and `noarchive` metadata.

Application-level limits are an abuse-control layer, not a substitute for infrastructure rate limiting. Before a broad public launch, add provider-level bot and traffic controls at the edge while retaining the database checks as defense in depth.

## Data model

- `inquiries` — private contact request, consent evidence, approved-version context, assignment, and status.
- `create_inquiry_commands` — anonymous and authenticated write-only creation boundary.
- `inquiry_status_commands` — authenticated write-only status transition boundary.
- `notifications` — safe agent alert with an inquiry identifier.
- `outbox_events` — identifier-only delivery work for future email or push delivery.
- `audit_events` — creation and effective status transitions without copied PII.

## Verification

Database tests cover anonymous submission, tenant and agent isolation, staff denial, broker access, caller-selected-agent rejection, honeypot rejection, consent evidence, normalization, idempotency, rate limits, write-only commands, safe notifications/outbox/audit records, registered-consumer provenance, and authorized status transitions.

Runtime tests cover input normalization, phone preference rules, consent, bounded honeypot input, and allowed status operations.

