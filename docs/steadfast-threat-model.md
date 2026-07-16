# SteadFast Security Plan and Threat Model

**Version:** 0.1  
**Prepared:** 16 July 2026  
**Status:** Pre-implementation security baseline  
**Scope:** Internet-facing Jamaica MVP using Next.js, Vercel and Supabase

## Executive summary

SteadFast is a multi-brokerage real-estate SaaS platform that will process identity, contact, listing, inquiry, billing and audit data. Its highest risks are cross-brokerage data access, privilege escalation, bypass of listing approval, exposure of service credentials, unsafe media, subdomain/session mistakes, and leakage of personal data through public projections, logs or caches.

The current repository is a secure foundation, not a production-ready application. It has pinned framework dependencies, browser-safe Supabase configuration validation, server-only client separation, baseline security headers, a nonce-based Content Security Policy, a minimal health route and public placeholder pages. It does not yet contain authentication flows, database migrations, RLS policies, listing endpoints, uploads, billing, integrations, rate limits, monitoring or automated security tests. Those controls are launch requirements, not assumed capabilities.

The central security design is defense in depth: server authorization plus PostgreSQL Row Level Security; immutable listing versions plus atomic approval; private media ingestion plus safe derivatives; sanitized public projections; isolated environments; least-privilege secrets; append-only audit; and tested recovery.

## Scope and assumptions

### In scope

- Next.js web application, Server Components, Server Actions and Route Handlers.
- Vercel preview, staging/pilot and production deployments.
- Supabase Auth, PostgreSQL, Row Level Security, Storage and associated service access.
- Public search, map, property, agent and brokerage websites.
- Agent, broker staff, broker, SteadFast operations and admin workspaces.
- Listing creation, approval, publication, sharing, inquiry and agent departure workflows.
- Email, maps, payments and future listing-channel adapters.
- GitHub source, CI/CD, environment variables, database migrations and backups.

### Out of scope for this version

- Vacation rentals, transaction closing, escrow or trust accounting.
- Native mobile applications.
- A public third-party developer API.
- Any live RAJ/MLS, Realtor.com International or Move integration that is not yet contracted and specified.
- Security of third-party provider internals beyond configuration and vendor-management obligations.

### Validated assumptions

- The application is public on the internet and serves unauthenticated visitors.
- It is multi-tenant, with brokerage as the tenant and listing owner.
- The initial pilot may include roughly 200 agents and brokers.
- Vercel and Supabase are the initial providers; portability is required.
- Personal data includes account, agent, inquiry, billing and audit information.
- SteadFast operations services accounts and system issues but cannot decide brokerage listing disputes or approvals.
- Brokerages verify their agents and listing documentation.

### Open assumptions requiring approval

- Exact legal entity, registered address, privacy contact and security contact.
- Production region, backup tier, recovery-time objective and recovery-point objective.
- MFA requirements for brokers, staff, operations and admins.
- Final email, maps, payments, monitoring and rate-limit providers.
- Data retention and deletion schedule by record class.
- Public address precision and image metadata policy.

### Evidence anchors

- package.json: pinned Next.js, React, Supabase and TypeScript dependencies.
- proxy.ts: nonce CSP and Supabase connection allowlist; API routes are excluded from its matcher.
- next.config.ts: global content-type, framing, referrer and permissions headers.
- lib/supabase/config.ts: HTTPS Supabase URL and publishable-key validation.
- lib/supabase/client.ts and lib/supabase/server.ts: separate browser and server clients; server module is server-only.
- app/api/health/route.ts: no-store health response with safe configuration state.
- app/properties/page.tsx: no synthetic listing data and no database connection yet.
- .env.example and SECURITY.md: browser-safe environment contract and secret-handling baseline.
- docs/SteadFast_Database_Design_v0.1.md: target tenant, listing, public projection, storage, billing, integration and audit schema.

## System model

### Components

| Component | Trust level | Security responsibility |
|---|---|---|
| Browser | Untrusted | Render UI; never holds privileged credentials |
| Vercel edge/runtime | Trusted application boundary | TLS termination, routing, Next.js execution, headers |
| Next.js authorization/DAL | Trusted | Session validation, runtime validation, resource and capability checks |
| Supabase Auth | Trusted identity service | Identity, session and MFA |
| PostgreSQL | Highest-trust system of record | Constraints, RLS, transactions, audit and public projection |
| Supabase Storage | Sensitive content store | Private originals, safe derivatives and object policies |
| Job/outbox worker | Privileged narrow service | Notification and integration delivery |
| Email/maps/payments/channels | External trust boundary | Contracted provider-specific actions |
| GitHub/Vercel deployment control | Supply-chain boundary | Source, build, secrets and production promotion |

### Trust boundaries

1. Public internet to Vercel/Next.js.
2. Browser to Supabase APIs using a publishable key.
3. Next.js server to Supabase with user session or narrowly controlled service access.
4. Application/database to storage and background workers.
5. SteadFast to third-party providers and inbound webhooks.
6. Developer source/CI to production deployment and migrations.
7. One brokerage tenant to every other brokerage.
8. Public projection to private workflow and personal data.

## Data flows

1. A visitor searches; the application reads only approved public snapshots and returns bounded results.
2. A consumer submits an inquiry; the server validates, rate-limits, records consent and routes to selected and secondary recipients.
3. A professional signs in through Supabase Auth; server code resolves person, active membership and current capabilities.
4. An agent uploads media into a private quarantine path and creates a draft listing version.
5. Submission freezes the version and creates a brokerage review item.
6. An authorized reviewer approves atomically; database checks advance the approved pointer and rebuild the public snapshot.
7. The outbox sends notifications to owner and display agents and later sends approved exports to authorized channels.
8. Payment webhooks update append-only billing records and derived entitlements after signature and replay checks.
9. Operations accesses scoped support data; admins use separately audited elevated functions.

### Data-flow diagram

~~~mermaid
flowchart LR
  U[Untrusted browser] -->|HTTPS| V[Vercel and Next.js]
  V -->|User session and validated request| D[Authorization and domain services]
  D -->|RLS constrained SQL| P[(Supabase PostgreSQL)]
  U -->|Publishable key, RLS only| P
  D -->|Signed upload and policy| S[(Supabase Storage)]
  P -->|Transactional outbox| W[Worker]
  W --> E[Email]
  W --> C[External listing channel]
  X[Payment provider] -->|Signed webhook| V
  G[GitHub and CI] -->|Reviewed build and migrations| V
  G --> P
~~~

## Assets

| Asset | Sensitivity | Security objective |
|---|---|---|
| Sessions, reset links and MFA factors | Critical | Confidentiality and anti-replay |
| Service-role, payment, email and feed secrets | Critical | Never browser-visible; least privilege; rotation |
| Brokerage memberships and capability grants | Critical | Integrity and tenant isolation |
| Approved listing pointer and public status | Critical | Integrity, approval and non-repudiation |
| Drafts, versions and review history | High | Tenant confidentiality and immutable history |
| Inquiry identity and messages | High | Confidentiality, consent and controlled routing |
| Billing records and entitlements | High | Integrity and availability |
| Original media and exact location | High | Controlled access and safe publication |
| Public snapshots | Public but integrity-sensitive | Accuracy, freshness and abuse resistance |
| Audit events | Critical | Append-only integrity and restricted access |
| Source, dependencies and deployment configuration | Critical | Supply-chain integrity |
| Backups and exports | Critical | Confidentiality, restoration and retention |

## Attacker model

### Capabilities

- Anonymous attacker can enumerate public routes, automate requests, submit forms and upload when exposed.
- Registered consumer or professional can alter request bodies, identifiers, headers, cookies and API calls outside the UI.
- Malicious or compromised agent/staff account can attempt cross-brokerage access or unauthorized approval.
- Insider with operations, admin, repository, Vercel or Supabase access may abuse legitimate privileges.
- External party can spoof callbacks, replay webhooks, poison feed data or exploit outbound-request behavior.
- Supply-chain attacker can target dependencies, source control, CI tokens or build configuration.

### Constraints

- The model does not assume compromise of Vercel or Supabase core infrastructure.
- The attacker does not initially possess production service credentials.
- Physical endpoint compromise is handled by organizational policy and session controls, not device management in the MVP.

## Entry points

- Public pages, search parameters, map bounds, inquiry and registration forms.
- Authentication callbacks, password reset and invitation links.
- Server Actions, Route Handlers and future REST endpoints.
- Listing text, structured fields, rich content, uploads and image metadata.
- Agent/staff invitations, membership changes and capability administration.
- Approval, publication, sharing, withdrawal, sold/rented and reassignment actions.
- Host header, subdomain routing, redirects and generated links.
- Payment, email and listing-channel webhooks.
- Outbound geocoding, image fetching or integration requests.
- GitHub pull requests, dependencies, Vercel configuration, Supabase dashboard and migrations.
- Logs, analytics, support views, exports, backups and error reports.

## Top abuse paths

1. **Cross-brokerage identifier substitution:** a professional changes a listing, review, inquiry or membership ID and reads or mutates another brokerage's data.
2. **Privilege escalation:** a user alters metadata, invitation state or grant requests to become staff, broker, operations or admin.
3. **Approval bypass:** an agent directly changes publication fields, approved pointers or public snapshots without a valid brokerage decision.
4. **Credential exposure:** a service key is committed, logged, placed in a NEXT_PUBLIC variable or bundled into client code, bypassing RLS.
5. **Malicious media:** an attacker uploads active content, polyglot files, oversized images or metadata that leads to stored XSS, malware or resource exhaustion.
6. **Subdomain/session confusion:** hostile Host input or broad-domain cookies cause tenant misrouting, open redirect, session leakage or takeover.
7. **Public-data leakage:** exact addresses, inquiry data, drafts or internal notes enter search results, caches, sitemap, logs or public storage.
8. **Webhook/feed attack:** forged or replayed callbacks alter billing or publication; unbounded external URLs enable SSRF.
9. **Audit destruction:** a privileged user edits or deletes decision records to conceal self-approval, reassignment or billing changes.
10. **Supply-chain compromise:** malicious dependency or stolen GitHub/Vercel credential deploys code that steals sessions or database secrets.

## Threat table

| ID and threat | Assets and impact | Preconditions and likelihood | Existing controls | Planned mitigations, detection and residual risk |
|---|---|---|---|---|
| TM-001 — Cross-brokerage IDOR or RLS gap | Listings, inquiries, memberships and billing; critical confidentiality/integrity breach | Authenticated attacker plus missing tenant predicate; high | UUID design; server/client split | RLS on every exposed table, explicit grants, DAL resource checks and negative tenant tests. Alert on denied cross-tenant patterns; residual medium from policy complexity. |
| TM-002 — Privilege escalation through metadata or grants | Roles and platform/brokerage authority; critical control takeover | User-controlled claims or weak invitation; medium | Publishable-key validation; security guidance | Authoritative DB grants, never user_metadata, dual control for admin, MFA and audited grant/revoke. Alert on elevation; residual low/medium. |
| TM-003 — Approval or publication bypass | Approved pointers and public snapshots; false/unauthorized publication | Direct table access or non-atomic workflow; high | Approved workflow/schema specification | Revoke direct writes, atomic function, immutable versions, eligibility checks and self-approval flag. Reconcile snapshots; residual low. |
| TM-004 — Service credential exposure | Database, storage and providers; critical platform compromise | Secret in Git, logs, build or browser; medium | .env contract; server-only module; no current secret | Secret scanning, restricted Vercel scopes, rotation runbook, break-glass access and no routine service key. Monitor key use; residual low/medium. |
| TM-005 — Malicious upload or stored XSS | Users, media and availability; account compromise, malware or denial of service | Upload endpoint and unsafe serving; high | CSP baseline | Private quarantine, detected-type checks, decode/re-encode, metadata stripping, resource limits, safe disposition and scanning. Alert anomalies; residual medium. |
| TM-006 — Session, CSRF, redirect or subdomain confusion | Sessions and tenant context; account takeover/unauthorized action | Cookie auth plus weak origin/host rules; medium | Nonce CSP and headers | Host and redirect allowlists, host-only Secure HttpOnly SameSite cookies, server session checks, Origin/CSRF protection and rotation. Monitor anomalies; residual low/medium. |
| TM-007 — Inquiry, registration or search abuse | Availability, inboxes and costs; spam, scraping and degradation | Anonymous automation; high | Bounded placeholder input | Layered limits, bot signals, quotas, payload bounds, queue and enumeration-resistant responses. Per-source metrics; residual medium. |
| TM-008 — Forged webhook, replay or SSRF | Billing, entitlements and integrations; fraud, data leak or internal probing | Public callback or server fetch; medium | No integrations implemented | Raw-body signatures, timestamp/replay store, idempotency, URL/DNS/IP allowlists and egress restriction. Alert failures/replays; residual medium. |
| TM-009 — Audit tampering or repudiation | Reviews, shares, departures and billing; dispute/compliance failure | Privileged account or broad DB rights; medium | Planned audit schema | Append-only table, no update/delete, restricted export, optional checkpoints and independent retention. Monitor gaps/privileged reads; residual low/medium. |
| TM-010 — Public projection, cache or log leakage | Personal data, drafts and exact address; high privacy/regulatory harm | Wrong DTO, cache or logging; medium | No-store health route; public placeholder | Allowlisted projection, DTO tests, private/no-store auth responses, log redaction and sitemap rules. Canary/schema-diff tests; residual low/medium. |
| TM-011 — Supply-chain or deployment compromise | Source, runtime and secrets; critical full compromise | Malicious package or stolen control-plane account; medium | Pinned lockfile and patched baseline | Protected branch, reviews, CI, dependency scanning, controlled release, MFA and least privilege. Audit deployment actor/diff; residual medium. |
| TM-012 — Unsafe admin or support access | Personal data and all tenants; broad exposure/destruction | Compromised or abusive privileged user; medium | Separate planned roles | MFA, just-in-time admin, reason/ticket, restricted impersonation, no raw secrets and detailed audit. Review sessions/exports; residual medium. |
| TM-013 — Payment-state manipulation | Invoices and entitlements; revenue loss or wrongful suspension | Client-trusted success or duplicate webhook; medium | Append-only target design | Provider-authoritative events, signature/replay/idempotency, reconciliation and audited override. Daily reconciliation; residual low. |
| TM-014 — Backup loss, corruption or failed restore | All durable data; extended outage or permanent loss | Provider incident or operator error; low/medium | Provider backup capability exists | Paid backup tier, permitted off-platform exports, restore drills and recovery runbook. Quarterly evidence; residual depends on approved RPO/RTO. |

## Criticality rationale

- **Critical:** compromise crosses tenant boundaries at scale, grants platform authority, exposes service credentials, corrupts publication integrity, or causes unrecoverable loss.
- **High:** exposes significant personal or business data, compromises accounts through stored content, or creates material false publication.
- **Medium:** requires stronger preconditions, affects a bounded scope, or has reliable recovery but still needs a launch control.
- **Low:** limited impact with no meaningful confidentiality, integrity or availability consequence.

TM-001, TM-002, TM-003, TM-004 and TM-011 receive first implementation priority because they protect the tenancy and control plane. A feature is not pilot-ready merely because it works functionally; its applicable launch controls and negative tests must pass.

## Focus paths

### 1. Tenant isolation and authorization

Implement membership-aware SQL helper functions carefully, index every policy predicate, enable RLS on every exposed table, grant only required verbs, use security-invoker views, and test each role against same-tenant and other-tenant rows. Do not use user-editable metadata. Service-role access is limited to narrowly defined background/admin operations.

### 2. Listing approval integrity

Approved versions are immutable. Direct writes to approved pointers and public snapshots are revoked. One transaction validates reviewer, membership, capability, listing brokerage, representative, entitlement, version freshness and required data; writes the decision, advances publication and appends audit/outbox events.

### 3. Secrets and deployment control

Secrets live only in environment-scoped control planes. Preview and production values differ. Enable secret scanning, protected production branch, required checks, MFA for GitHub/Vercel/Supabase, least-privilege project access and documented rotation. Any suspected leak triggers rotation before investigation continues.

### 4. Media and public-content safety

Treat file name, type, metadata and content as hostile. Keep originals private, validate actual content, decode/re-encode images, generate derivatives, cap resources, publish with safe MIME/content-disposition and never render user HTML. Maintain a strict CSP and review any future rich-text feature separately.

### 5. Privacy, caching and public projection

Define a public allowlist, not a private-field denylist. Public APIs query a sanitized snapshot. Authenticated pages and APIs are private/no-store. Redact structured logs and support views. Exact location, inquiries, billing, audit, draft and rejection data never enter public projection, analytics payloads or search indexes.

## Security control plan

### Identity and access

- Email verification and invitation binding for professionals.
- MFA required for SteadFast admin and operations; strongly recommended as a pilot gate for brokers and authorized staff.
- Bounded sessions, rotation after login and privilege change, active-session revocation and reauthentication for high-risk actions.
- One active brokerage membership enforced in the database for MVP.
- Capability grants are explicit, time-stamped, revocable and audited.
- Separate break-glass admin account with alerting and no routine use.

### Application security

- Runtime schemas for every request, form, webhook and integration payload.
- Authorization at each Server Action/Route Handler and inside the database.
- CSRF/Origin protection for cookie-authenticated state changes.
- Strict redirect, host, URL, CORS and outbound-destination allowlists.
- Payload, pagination, query complexity, upload and execution limits.
- Safe error responses with request IDs; no stack traces or sensitive values.
- CSP nonces, no unsafe HTML, frame denial, content-type protection and safe referrer policy.

### Database and Supabase

- Versioned migrations reviewed in Git; no untracked dashboard schema changes.
- RLS and explicit grants on all exposed tables; policy tests run in CI.
- Public reads only from security-invoker sanitized views/projections.
- Security-definer functions owned by a non-login role, fixed search_path, fully qualified objects and revoked PUBLIC execute.
- Database constraints enforce tenant/ownership relationships and immutable approved history.
- Storage policies cover insert/select/update/delete; overwrite requires all applicable permissions.

### Infrastructure and operations

- Preview, staging and production isolation.
- Vercel deployment protection for previews where compatible with client review.
- Production promotion only after automated gates and an approved preview.
- Central error monitoring, availability checks, security alerts and outbox/backlog alerts.
- Dependency updates and urgent security patch process.
- Backup retention, restore drills, migration rollback and incident runbooks.

### Privacy and legal alignment

- Data inventory, purpose, lawful basis, minimization, retention and recipient records.
- Jamaican Data Protection Act readiness, OIC registration assessment, data-subject request process and breach procedure.
- Processor/subprocessor contracts and cross-border transfer review.
- Brokerage listing-content authorization and responsibility terms.
- Privacy notice at collection, consent evidence where needed, and separate marketing choice.

## Secure development lifecycle

1. Threat-model each epic that changes trust boundaries, sensitive data or external providers.
2. Add abuse cases and security acceptance criteria before implementation.
3. Review schema, grants and RLS with every migration.
4. Require lint, typecheck, unit, integration, RLS, E2E and dependency checks in CI.
5. Review authentication, authorization, input handling, caching, uploads, logs and secrets in pull requests.
6. Test staging with synthetic data and role-specific accounts.
7. Perform an independent penetration test before broad public launch.
8. Record residual risk and owner for every deferred security control.

## Incident response

The incident owner classifies severity, contains access, preserves evidence, rotates affected credentials, disables only the vulnerable function where possible, communicates internally, assesses personal-data and contractual notification duties, restores from a known-good state, and completes a blameless review.

Minimum runbooks: compromised account, leaked secret, cross-tenant access, malicious upload, public data exposure, payment webhook abuse, integration leak, deployment compromise, database outage and failed restore.

## Launch security gates

- RLS coverage and cross-tenant negative tests pass for every exposed table.
- No service credential appears in source, browser bundles, logs or preview responses.
- Professional and privileged role escalation tests fail.
- Listing publication cannot be changed without an approved immutable version.
- Upload validation and safe delivery pass malicious-file tests.
- Public projection, cache and sitemap tests prove private fields are absent.
- Webhook replay and signature tests pass before a provider is enabled.
- Preview/staging/production data and credentials are isolated.
- Backup tier, retention, RPO/RTO and successful restore evidence are approved.
- Security contact, incident owners, privacy process and legal launch documents are active.

## Sources

- Supabase documentation: Row Level Security (https://supabase.com/docs/guides/database/postgres/row-level-security), server-side authentication, Storage access control and database backups.
- Next.js documentation: authentication, Route Handler/Server Action authorization and data security (https://nextjs.org/docs/app/guides/authentication).
- OWASP guidance: authorization, input validation, file upload, CSRF, logging and third-party JavaScript.
- SteadFast repository and approved planning specifications listed in Evidence anchors.
