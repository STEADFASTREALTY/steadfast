# SteadFast Testing and Deployment Plan

**Version:** 0.1  
**Prepared:** 16 July 2026  
**Status:** MVP delivery baseline  
**Platforms:** GitHub, Vercel, Supabase

## 1. Objective

Every change should produce a reviewable Vercel preview, pass automated quality and security gates, promote through isolated non-production data, and reach production with a tested rollback and recovery path. SteadFast is not deployed as a local production service.

## 2. Quality strategy

| Layer | Purpose | Typical scope |
|---|---|---|
| Static checks | Catch unsafe or inconsistent code early | Formatting, lint, TypeScript, forbidden imports/secrets |
| Unit | Prove small rules | Status transitions, pricing, validation, mapping |
| Component | Prove interface behavior | Forms, errors, accessibility, responsive states |
| Database | Prove constraints and RLS | Tenant isolation, approvals, immutability, audit |
| Integration | Prove module boundaries | Auth, storage, outbox, payments, geocoding |
| Contract | Prove API/provider shape | Internal v1 schemas, webhooks, feed adapters |
| End-to-end | Prove user outcomes | Agent create, staff approve, public search/inquiry |
| Non-functional | Prove operational fitness | Security, accessibility, performance, recovery |

## 3. Test environments and data

| Environment | Purpose | Data policy | Deployment |
|---|---|---|---|
| Developer | Code and fast automated tests | Synthetic only | Local execution permitted; not a public deployment |
| Preview | Every branch/pull request | Ephemeral synthetic seed | Automatic Vercel preview |
| Staging/pilot | Release candidate and client acceptance | Controlled test/pilot data | Stable protected Vercel environment |
| Production | Live service | Live data only | Canonical domain after approval |

Production data is never copied into preview. If staging ever needs production-like data, use an approved, irreversible anonymization process.

## 4. Test accounts

Maintain seeded identities for visitor, consumer, agent, agent-plus-staff, staff, broker, operations and admin. Use at least two brokerages so every feature includes cross-brokerage negative cases. Include active, pending, deactivated, departed and unassigned states.

Automated tests must never use real email addresses, payment cards, listing documents or inquiry content. Provider sandboxes and test numbers are mandatory.

## 5. Functional test suites

### 5.1 Identity and membership

- Registration, email confirmation, sign-in, sign-out and password recovery.
- Invitation expiry, reuse, wrong email and wrong brokerage.
- Broker approval/denial of agent application.
- One active brokerage membership constraint.
- Staff capability grant/revoke and combined agent/staff behavior.
- Agent departure, same-account rejoining and no transfer of old listings.
- Session revocation and privilege-change refresh.

### 5.2 Listings and approval

- Draft autosave and recovery.
- Required fields by sale and long-term rent.
- Media validation, ordering and removal.
- Submission freezes the reviewed version.
- Approve, return, reject, correct and resubmit.
- Broker/staff self-approval and audit flag.
- Price, address, removal and sold/rented changes require approval.
- Pending change never alters the approved public version.
- Concurrency conflict and duplicate submission.
- Agent departure unpublishes and creates unassigned work.

### 5.3 Public search and websites

- Only eligible approved snapshots appear.
- Filters, sorting, pagination, map bounds and clusters.
- Mobile and keyboard list alternative to map.
- Agent site owned/shared inventory.
- Brokerage site all published brokerage inventory.
- Canonical URL, sitemap and noindex rules.
- Exact/public address precision.

### 5.4 Sharing and inquiries

- Share creation without broker approval.
- Recipient cannot edit or transfer ownership.
- Recipient removal and owner notification.
- Owner revocation and shared-agent change notifications.
- Both agent cards display; consumer chooses primary contact.
- Correct routing, consent record and duplicate/spam handling.

### 5.5 Billing, operations and administration

- One professional payment for combined capabilities.
- Plan seats, invoices, payment failure and entitlement reconciliation.
- Signed/replayed/duplicate webhook scenarios.
- Operations can service system/billing issues but cannot control listing content.
- Admin grant, high-risk action audit and break-glass process.

## 6. Database and RLS testing

Each migration includes pgTAP or equivalent tests for:

- RLS enabled on every exposed table.
- Explicit grants for anon, authenticated and service roles.
- Anonymous access limited to public projections.
- Same-tenant positive and other-tenant negative operations for every professional role.
- User-editable metadata cannot grant permission.
- Insert, select, update and delete policies independently tested.
- Update policies include required select visibility and post-update constraints.
- Public views use security-invoker behavior.
- Security-definer functions fix search_path, qualify objects and restrict execute.
- Approved versions and audit events cannot be updated/deleted through application roles.
- Foreign keys and composite constraints prevent cross-tenant references.

Run tests using actual JWT/session contexts, not only a database owner.

## 7. API and contract testing

- Runtime validation rejects missing, extra, oversized and malformed fields.
- 401, 403, 404, 409, 422 and 429 behavior is consistent.
- Pagination limits and query complexity are bounded.
- Idempotency prevents duplicate publication, invoice, notification and feed effects.
- Authenticated responses include private/no-store caching.
- Public response schemas contain only approved fields.
- Webhook signature, raw-body, timestamp and replay checks pass.
- External adapters use recorded fixtures and contract versions.

## 8. Security testing

- Secret scanning in source and commits.
- Dependency and framework vulnerability checks.
- Authorization matrix and ID substitution tests.
- CSRF/Origin, host-header, open-redirect and CORS tests.
- Stored/reflected DOM XSS and strict CSP verification.
- Upload polyglot, MIME mismatch, image bomb, metadata and path tests.
- Rate-limit and abuse tests for sign-in, reset, registration, inquiry, search and upload.
- SSRF tests for every server-side outbound URL.
- Log/redaction and error-response inspection.
- Session fixation, expiry, privilege change and logout tests.
- Independent penetration test before broad public launch.

## 9. Accessibility and usability testing

Automate obvious WCAG failures, then manually test keyboard navigation, focus order, screen-reader names, error summaries, zoom/reflow, contrast, touch targets, map alternatives and reduced motion. Test novice completion of first listing, review decision and public inquiry.

## 10. Performance and capacity

Initial targets, to be refined with pilot evidence:

| Measure | Target |
|---|---|
| Public page LCP at p75 | 2.5 seconds or better on mobile |
| Public interaction responsiveness | 200 ms INP or better at p75 |
| Layout shift | 0.1 CLS or lower |
| Public API p95, excluding provider calls | Under 500 ms |
| Authenticated mutation p95 | Under 1 second |
| Search result cap | Bounded, cursor-paginated |
| Availability target | 99.9% monthly after paid production launch |

Load tests cover at least expected pilot traffic plus a justified burst factor, public search, inquiry spikes, simultaneous approvals, uploads and outbox backlog. Provider quotas and free-plan limitations are documented before pilot.

## 11. CI pipeline

On each pull request:

1. Reproducible dependency install from lockfile.
2. Secret and credential-pattern scan.
3. Lint and TypeScript checks.
4. Unit and component tests.
5. Build production bundle.
6. Start isolated Supabase test stack/project and apply migrations from zero.
7. Database constraints and RLS tests.
8. Integration and API contract tests.
9. Vercel preview deployment.
10. Smoke and end-to-end tests against preview.
11. Accessibility and security-header checks.
12. Human preview review and required approval.

Production promotion is blocked on failures. Emergency changes still require a reviewed commit, minimum automated checks and a written incident/change record.

## 12. Branch and review policy

- main is protected and always releasable.
- Feature work uses short-lived branches and pull requests.
- At least one reviewer approves normal changes; database authorization, billing, authentication and admin changes require a security-aware reviewer.
- No direct production edits in Vercel or Supabase except documented emergency response.
- All schema changes are migrations in Git.
- Pull requests include purpose, screenshots, test evidence, migration/rollback impact, security/privacy impact and documentation changes.

## 13. Deployment sequence

1. Merge an approved pull request.
2. Build a production candidate with production-scoped configuration.
3. Verify database backup/restore point and migration compatibility.
4. Apply backward-compatible migrations.
5. Deploy application with new code paths disabled if necessary.
6. Run production smoke checks.
7. Enable feature flag gradually.
8. Monitor errors, latency, RLS denials, outbox, payments and publication.
9. Record release version, commit, migration and approver.

Use expand-and-contract migrations: add compatible structures, deploy code that can use both states, backfill safely, switch reads/writes, then remove obsolete structures in a later release.

## 14. Rollback and recovery

Application rollback uses a known-good Vercel production deployment. Because platform rollback does not reverse database migrations or restore changed environment variables, every release includes a database compatibility/rollback plan.

Database rules:

- Prefer forward fixes for additive migrations.
- Never run a destructive migration without a verified backup, retention decision and staged rehearsal.
- Make background jobs idempotent and safe to pause.
- Pause publication/integration workers during inconsistent states.
- Record manual data repair as an audited migration or script.

## 15. Backup and disaster recovery

Before live pilot data:

- Select a Supabase plan/tier that satisfies approved backup retention and point-in-time requirements.
- Define RPO and RTO with the business.
- Include database, auth configuration, storage objects, integration mappings and secrets inventory in recovery planning.
- Store infrastructure/configuration documentation outside the production system.
- Perform a staging restore drill and record duration, completeness and gaps.
- Repeat restore tests at least quarterly and after material architecture changes.

## 16. Monitoring and release health

Monitor:

- public availability and Core Web Vitals;
- error rate and latency by route;
- sign-in/reset anomalies;
- authorization denials and cross-tenant probes;
- approval/publication failures;
- stale public snapshots;
- upload failures and storage use;
- outbox depth, retry and dead-letter counts;
- payment webhook and reconciliation errors;
- feed acceptance/rejection;
- database connections, CPU, storage and slow queries.

Every alert has severity, owner, response time and runbook. Logs use request IDs and exclude secrets, session material and unnecessary personal data.

## 17. Client demo process

Each meaningful build receives a shareable preview URL and short release note covering what changed, what to test, known limitations and test accounts. Preview protection must allow the client to review without granting repository or project administration access. Use Vercel shareable access when available; do not add clients as code or infrastructure administrators merely to view the application.

## 18. Release readiness checklist

- Acceptance criteria and regression suite pass.
- Security controls and applicable threat mitigations pass.
- RLS matrix and migration-from-zero pass.
- Accessibility and responsive review pass.
- Client/stakeholder acceptance is recorded.
- Legal notices and provider terms are current.
- Monitoring, alerts and runbooks are active.
- Backup/restore evidence is current.
- Rollback owner and decision point are named.
- Release notes and technical documentation are updated.

## 19. Pilot exit criteria

- Core vertical slice works reliably for multiple brokerages.
- No unresolved critical/high security finding.
- No cross-tenant data exposure.
- Approval/publication audit is complete and reconcilable.
- Support response and incident process is tested.
- Billing state reconciles with provider records.
- Performance meets pilot targets under measured load.
- At least one successful restore drill.
- Pilot feedback is prioritized into the backlog.

## 20. Open decisions

- Test runner, browser automation and CI service configuration.
- Staging Supabase project and paid backup tier.
- Error monitoring, uptime and log providers.
- Final RPO/RTO, retention and support severity targets.
- Client preview-access method under the selected Vercel plan.
- Penetration-test provider and launch timing.
