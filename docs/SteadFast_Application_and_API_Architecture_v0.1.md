# SteadFast Application and API Architecture

**Version:** 0.1  
**Prepared:** 16 July 2026  
**Status:** Target architecture; implementation has not yet begun  
**Applies to:** Jamaica MVP and later country expansion

## 1. Purpose

This document defines the application boundaries, API conventions, hosting model, identity controls, publication path, subdomain strategy, and integration approach for SteadFast. It translates the approved product, permissions, workflow, and database specifications into a buildable system design.

## 2. Architecture decisions

- Build one modular Next.js application first, not independent microservices. Domain modules remain separable so high-volume functions can be extracted later.
- Use Supabase PostgreSQL as the system of record, Supabase Auth for identity, and Supabase Storage for media.
- Use Vercel for previews and web delivery. Keep business rules in portable TypeScript and SQL migrations to reduce provider lock-in.
- Treat the brokerage as the tenant and listing owner. A person may hold multiple capabilities, but only one active brokerage membership is allowed in the MVP.
- Make the approved listing version immutable. Pending edits are separate versions and never overwrite public data.
- Expose public listings through a sanitized publication projection, not through raw listing tables.
- Require server authorization and database Row Level Security. Navigation visibility is never an authorization control.
- Implement external portals as delivery channels with their own credentials, mappings, validation, queue, retry, and status history.

## 3. System context

~~~mermaid
flowchart LR
  V[Visitors and consumers] --> W[Public web and agent or broker sites]
  P[Agents, staff, brokers] --> A[Authenticated workspaces]
  O[SteadFast operations and admins] --> M[Operations and administration]
  W --> N[Next.js application on Vercel]
  A --> N
  M --> N
  N --> S[Supabase Auth, PostgreSQL, Storage]
  N --> Q[Notification and job outbox]
  Q --> E[Email provider]
  Q --> X[Approved external listing channels]
  N --> G[Map and geocoding provider]
  N --> B[Payment provider]
~~~

## 4. Logical modules

| Module | Responsibility | Principal data |
|---|---|---|
| Public discovery | Search, filters, map clusters, property detail, contact selection | Public listing snapshots, public profiles, site configuration |
| Identity and access | Sign-up, sign-in, invitations, sessions, MFA, membership and capability checks | Auth users, people, memberships, role grants |
| Brokerage management | Company profile, staff, agents, invitations, deactivation and reassignment | Brokerages, memberships, invitations, assignments |
| Listing workspace | Draft creation, media, validation, versioning, submission and status | Properties, listings, versions, media |
| Approval desk | Review queue, comparison, return, reject and approve | Reviews, decisions, approved pointers, audit events |
| Websites and sharing | Agent/broker sites, display grants and removals | Sites, domains, shares, public snapshots |
| Inquiries | Contact choice, routing, acknowledgement and status | Inquiries, recipients, consent records |
| Billing | Plans, seats, invoices, payments, entitlements | Subscriptions, invoices, payments, entitlement grants |
| Operations | Customer support, system flags, delivery health and billing service | Support cases, flags, job status, non-content actions |
| Administration | Platform policy, global configuration, access and audit | Admin grants, feature flags, audit events |
| Integrations | Feed adapters, export validation, delivery and reconciliation | Channels, mappings, distributions, delivery attempts |

## 5. Application route structure

| Surface | Illustrative routes | Access |
|---|---|---|
| Public | /, /properties, /property/[slug], /agent/[slug], /brokerage/[slug] | Everyone |
| Account | /sign-in, /register, /forgot-password, /account | Guest or signed-in user |
| Agent workspace | /workspace/listings, /workspace/listings/new, /workspace/shares, /workspace/inquiries | Active professional capability |
| Approval desk | /broker/approvals, /broker/approvals/[id], /broker/agents | Broker or authorized staff |
| Brokerage control | /brokerage/company, /brokerage/team, /brokerage/subscription, /brokerage/site | Broker capability |
| Operations | /operations/customers, /operations/billing, /operations/flags, /operations/delivery | SteadFast operations |
| Administration | /admin/access, /admin/configuration, /admin/audit, /admin/integrations | SteadFast admin |

Route groups organize layouts; authorization is enforced inside each data read and mutation. Proxy may perform a fast session check, but every Server Action and Route Handler must repeat the authoritative check.

## 6. API design

### 6.1 Interaction patterns

- Use Server Components for request-time reads that are only consumed by the SteadFast web application.
- Use Server Actions for same-origin form mutations after runtime validation, authentication, authorization, and idempotency checks.
- Use Route Handlers for public APIs, webhooks, asynchronous callbacks, exports, and future mobile or partner clients.
- Permit browser-to-Supabase calls only for deliberately exposed, RLS-protected operations. Privileged writes use server-only code.
- Never place a Supabase service-role key, payment secret, feed credential, or email credential in browser code.

### 6.2 API namespace

| Namespace | Examples | Notes |
|---|---|---|
| /api/v1/public | search, listing detail, brokerage site, inquiry create | Sanitized fields, rate limited |
| /api/v1/me | profile, sessions, notification preferences | Current person only |
| /api/v1/listings | create, version, submit, share, withdraw request | Resource and membership checks |
| /api/v1/broker | approvals, agents, assignments, publication actions | Brokerage-scoped capability checks |
| /api/v1/operations | cases, flags, billing service, channel health | No authority to approve brokerage content |
| /api/v1/admin | global access, configuration, audit export | MFA and elevated audit requirements |
| /api/v1/integrations | channel exports, acknowledgements, reconciliation | Adapter boundary |
| /api/webhooks | payment, email, feed callbacks | Signature, replay and timestamp validation |

### 6.3 Contract rules

- JSON uses UTF-8, ISO 8601 UTC timestamps, UUID identifiers, explicit currency codes, and versioned enumerations.
- Success responses return data plus a request identifier. Errors return a stable code, safe message, field details when appropriate, and request identifier.
- Use 401 for missing/invalid identity, 403 for insufficient permission, 404 when disclosure would reveal another tenant's resource, 409 for version conflict, 422 for validation, and 429 for throttling.
- POST operations with financial, publication, notification, or delivery effects require an Idempotency-Key.
- Use cursor pagination for mutable collections; bound page size and filter complexity.
- Enforce optimistic concurrency with version number or updated-at preconditions.
- Do not promise a public partner API in the MVP. Internal v1 contracts are designed so selected endpoints can later be published with OAuth, quotas, and documentation.

## 7. Identity, session and authorization

Supabase Auth creates the identity. The SteadFast people table is the durable application identity. Brokerage membership and capability grants are authoritative in PostgreSQL; user-editable metadata is not used for authorization.

Every protected request follows this sequence:

1. Validate the session on the server.
2. Load the active person, membership, status, and current capability grants.
3. Check tenant, resource state, and action-specific policy.
4. Execute through an RLS-constrained database session or a narrowly scoped security-definer function.
5. Append an audit event for sensitive or material changes.

Admin, operations, broker, staff, and agent capabilities may coexist. Billing uses one professional seat per person, while permissions remain additive and explicit.

## 8. Listing approval and publication

An agent edits a draft version. Submission freezes that version for review. Approval atomically verifies the reviewer, brokerage ownership, active representative, required fields, media readiness, subscription entitlement, and current version. It then advances the approved pointer, refreshes the public snapshot, creates notifications, and records the audit event.

A broker or authorized staff member may approve their own listing submission, as approved by the business rules. The audit log must identify self-approval.

Removal, sold/rented status, price change, address change, ownership change, and other material changes follow the same version-and-approval pattern. An agent departure unpublishes represented listings and leaves them with the brokerage in an unassigned state.

## 9. Public websites and subdomains

- The canonical public domain hosts search and general property pages.
- Agent and brokerage sites resolve from site and domain records, not hard-coded routes.
- The MVP may begin with path-based previews and a wildcard subdomain after DNS and certificate verification.
- Resolve the hostname against a strict allowlist. Never trust an arbitrary Host header for redirects, cookies, tenant selection, or generated links.
- Authentication cookies should remain host-only on the main application domain unless a later cross-subdomain requirement is approved and threat-modeled.
- An agent site shows owned listings plus accepted display shares. A brokerage site shows all currently published brokerage-owned listings.
- A shared listing identifies the owner agent and the displaying agent and lets the consumer select the contact.

## 10. Search, map and geography

Geocoding converts normalized addresses to PostGIS points through a provider adapter. Exact coordinates and exact addresses may be private while public snapshots expose approved display geography. Search combines structured filters with a geographic bounding box. The client requests clusters appropriate to zoom; the server returns area or grid aggregates when zoomed out and individual listings when zoomed in.

Provider calls are cached, rate limited, and reviewed for licensing and retention terms. A failed geocode goes to a correction queue and never silently publishes a guessed location.

## 11. Media architecture

- Upload to a private quarantine path using short-lived signed authorization.
- Validate extension, claimed type, detected type, dimensions, file size and image decode.
- Strip unnecessary metadata, generate safe derivatives, and scan where practical.
- Store original and derivatives separately; publish only approved derivatives.
- Use unguessable object paths and database ownership records. Storage policies mirror brokerage access.
- Deleting a listing does not immediately destroy audit-required media. Retention rules govern purge.

## 12. Notifications and background work

Database transactions create outbox records instead of directly sending email or external feeds. Workers claim jobs, send with an idempotency key, record attempts, retry temporary failures with backoff, and dead-letter permanent failures.

Events include submission, approval, return, rejection, material change, share added, share removed by recipient, inquiry, assignment loss, agent departure, invoice, payment failure, feed delivery and system flag. Notifications to shared display agents are generated when the approved listing changes.

## 13. External listing channels

RAJ/MLS, Realtor.com International, Move and other destinations remain planned channels until a written agreement, specification, credential set and data-use authorization are obtained. Each adapter maps from an approved canonical export model and cannot read drafts or raw internal fields.

The integration lifecycle is validate, queue, transform, send, acknowledge, reconcile, retry or quarantine. Store external IDs, payload hashes, schema version, consent/entitlement, timestamps and provider response. Never imply automatic syndication before a channel passes certification.

## 14. Payments

The payment provider stores card data; SteadFast stores provider customer/payment references, invoices, amounts, currency, status and event history. Webhooks require signature and replay validation. Entitlements change only through an idempotent billing service, not from a browser response. JMD is the launch billing currency unless a later pricing decision changes it.

## 15. Caching and data exposure

- Public snapshots may be cached briefly and invalidated after publication changes.
- Authenticated, tenant-specific, approval, inquiry, billing and admin responses are private and no-store.
- Cache keys must include every authorization or presentation dimension.
- Search engines index only canonical public pages. Draft, preview, workspace and shared preview URLs are noindex.
- Logs exclude cookies, authorization headers, tokens, full inquiry bodies, payment details and secret values.

## 16. Reliability and observability

Use structured logs with request, actor, brokerage, action, resource and outcome identifiers, while minimizing personal data. Monitor authentication errors, API latency, failed approvals, outbox backlog, notification failures, feed rejection, payment webhooks, database saturation, storage errors and public availability.

Business audit events are append-only and separate from operational logs. Alerts must identify an owner and runbook. Health endpoints reveal only safe readiness state.

## 17. Environment and deployment topology

| Environment | Web | Supabase | Data |
|---|---|---|---|
| Preview | Vercel branch preview | Dedicated non-production project | Synthetic, seeded and disposable |
| Staging/pilot | Stable protected deployment | Dedicated staging project | Approved pilot test data |
| Production | Canonical custom domain | Dedicated production project | Live data |

Environment variables are scoped separately. Migrations are versioned in Git and promoted in order. Production and staging must never share credentials, storage buckets, webhook secrets or user data.

## 18. Portability

Use standard PostgreSQL migrations and portable domain services. Isolate Vercel-specific request behavior, Supabase client construction, storage, email, maps, payments and feed providers behind adapters. Maintain documented environment contracts, export procedures, recovery tests and a provider-exit runbook.

## 19. Initial build boundaries

The first vertical slice is: invited agent signs in, creates a residential sale or long-term rental listing, uploads safe media, submits it, authorized brokerage staff approves it, and the approved listing appears in public search and on the brokerage and agent sites.

Vacation rentals, transaction closing, trust accounting, native mobile apps, public partner API, automated international syndication and advanced CRM remain outside the MVP.

## 20. Architecture acceptance gates

- No protected action relies only on navigation or client-side state.
- Cross-brokerage access tests fail closed at API and RLS layers.
- Pending edits cannot alter the approved public snapshot.
- Every material decision has actor, time, before/after version and reason.
- Public responses contain only approved projection fields.
- Service credentials are server-only and absent from Git and browser bundles.
- Preview, staging and production use separate data and credentials.
- External delivery is disabled until its agreement, mapping, validation and monitoring are approved.

## 21. Open decisions before implementation

- Select email, map/geocoding, payment and error-monitoring providers.
- Confirm wildcard DNS and custom-domain approach.
- Decide whether staging uses a dedicated paid Supabase project at pilot start.
- Define published address precision by listing type.
- Obtain each external channel's current technical and contractual requirements.
- Set final session duration, MFA policy, rate limits, file limits, retention periods and recovery objectives.

## 22. Sources

- Supabase Row Level Security (https://supabase.com/docs/guides/database/postgres/row-level-security), server-side authentication, Storage access control and backups.
- Next.js authentication and data-security guidance (https://nextjs.org/docs/app/guides/authentication).
- Vercel environment variables, deployment protection and rollback documentation (https://vercel.com/docs/environment-variables and https://vercel.com/docs/deployment-protection).
- SteadFast MVP Product Requirements, Roles and Permissions, Listing Workflow and Database Design v0.1.
