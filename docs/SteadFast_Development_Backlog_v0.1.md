# SteadFast Development Backlog

**Version:** 0.1  
**Prepared:** 16 July 2026  
**Status:** Ordered MVP implementation backlog  
**Priority:** P0 launch-critical, P1 pilot-value, P2 later

## 1. Delivery objective

Build the smallest secure vertical slice first: an invited agent signs in, creates a valid residential sale or long-term rental listing, submits it, authorized brokerage personnel approve it, and the approved listing appears in public search and on the correct agent and brokerage websites.

## 2. Definition of ready

A backlog item is ready when it has:

- clear user outcome and owner;
- linked product, permission, workflow and data rules;
- acceptance and abuse/security criteria;
- design state for user-facing work;
- migration/API impact;
- dependencies and test approach;
- no unresolved business decision that changes the implementation.

## 3. Definition of done

- Acceptance criteria pass.
- Server authorization and applicable RLS are implemented and negatively tested.
- Runtime validation, errors, loading, empty and accessibility states exist.
- Audit and notification events are correct.
- Unit, database, integration and E2E tests pass.
- Preview reviewed on desktop and mobile.
- Security/privacy checklist and threat model updated where needed.
- Migration is reversible/compatible and documentation is current.
- No critical/high unresolved defect.

## 4. Milestone map

| Milestone | Outcome | Depends on |
|---|---|---|
| M0 Foundation | Reproducible secure delivery pipeline | Existing prototype |
| M1 Identity and brokerage | Real users and tenant boundaries | M0 |
| M2 Listing draft | Agent can create a complete private draft | M1 |
| M3 Approval and publication | Brokerage-approved listing reaches public projection | M2 |
| M4 Public discovery | Visitors search, map and inquire | M3 |
| M5 Websites and sharing | Agent/broker sites and display permissions | M4 |
| M6 Billing and operations | Subscriptions and support controls | M1-M5 |
| M7 Integrations | Approved external channel framework | M3, contracts |
| M8 Pilot hardening | Tested, recoverable and legally ready pilot | All P0 |

## 5. M0 — Foundation and delivery

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| FND-001 | P0 | Protect main branch and define pull-request template | Direct pushes blocked; review and test evidence required |
| FND-002 | P0 | Add CI for install, lint, typecheck, test and build | Required checks run on every pull request |
| FND-003 | P0 | Create preview/staging/production environment contract | Variables documented and isolated by scope |
| FND-004 | P0 | Add secret scanning and dependency alerts | Test secret fails CI; lockfile scanning active |
| FND-005 | P0 | Establish Supabase migration structure | Fresh database builds from zero deterministically |
| FND-006 | P0 | Add test framework and seeded two-broker fixtures | Role accounts and cross-tenant data available in tests |
| FND-007 | P0 | Add request ID, safe error envelope and structured logging | No secret/session leakage; request trace available |
| FND-008 | P0 | Add monitoring and uptime provider adapters | Test error and outage alert reach owner |
| FND-009 | P1 | Feature-flag service | Flag changes are scoped and audited |
| FND-010 | P1 | Architecture decision record template | Material technical decisions are discoverable |

## 6. M1 — Identity, roles and brokerage

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| IAM-001 | P0 | People, brokerage, membership, role and grant migrations | Constraints match approved database design |
| IAM-002 | P0 | RLS and explicit grants for identity domain | Cross-broker access fails for every role |
| IAM-003 | P0 | Supabase SSR session validation and DAL | Protected routes/actions verify active database state |
| IAM-004 | P0 | Consumer registration, sign-in/out and recovery | Secure sessions and safe redirects tested |
| IAM-005 | P0 | Brokerage invitation and application flow | Invitation is bound, expiring and single-use |
| IAM-006 | P0 | Broker/staff approve or deny agent | Decision is scoped and audited |
| IAM-007 | P0 | Staff capability management | Broker grants/revokes explicit capabilities |
| IAM-008 | P0 | One active brokerage membership enforcement | Second active membership is rejected atomically |
| IAM-009 | P0 | Agent departure service | Membership ends and represented listings unpublish |
| IAM-010 | P0 | Capability-aware navigation and access-denied states | UI matches permission matrix; server remains authoritative |
| IAM-011 | P0 | MFA for operations/admin; policy for broker/staff | Elevated login requires approved factor |
| IAM-012 | P1 | Active-session view and revoke | User can terminate other sessions |

## 7. M2 — Listing draft and media

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| LST-001 | P0 | Property, address, listing, assignment and version migrations | Tenant and representative constraints enforced |
| LST-002 | P0 | RLS for listing domain | Agent/staff/broker matrix passes positive/negative tests |
| LST-003 | P0 | Create-listing wizard shell and autosave | Seven steps save/recover without data loss |
| LST-004 | P0 | Sale and long-term rental validation schemas | Required/bounded fields validated server-side |
| LST-005 | P0 | Address normalization and map confirmation adapter | Failed geocode requires correction |
| LST-006 | P0 | Private upload authorization | User can upload only into permitted brokerage/listing path |
| LST-007 | P0 | Media validation and derivative worker | Type mismatch, oversize and invalid images rejected |
| LST-008 | P0 | Draft preview and completeness check | Public-like preview shows validation gaps |
| LST-009 | P0 | Draft history and optimistic concurrency | Conflicting edit returns a recoverable 409 |
| LST-010 | P1 | Duplicate property/listing warning | Likely duplicates surfaced without blocking valid work |

## 8. M3 — Approval and publication

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| APR-001 | P0 | Review, decision, audit and outbox migrations | Immutable relationships and timestamps enforced |
| APR-002 | P0 | Submit-listing transaction | Submitted version freezes and queue item appears |
| APR-003 | P0 | Approval queue | Authorized reviewer filters and opens scoped work |
| APR-004 | P0 | Version comparison UI | Every changed/removed material field is visible |
| APR-005 | P0 | Return/reject with reason | Agent receives reason and preserved history |
| APR-006 | P0 | Atomic approve-and-publish function | Eligibility rechecked; pointer/snapshot/audit/outbox commit together |
| APR-007 | P0 | Self-approval behavior | Allowed staff/broker can approve; event is explicitly marked |
| APR-008 | P0 | Material-change workflow | Approved public version remains until new approval |
| APR-009 | P0 | Removal and sold/rented approval | Public state changes only after decision |
| APR-010 | P0 | Unassigned listing queue/reassignment | Publication requires new active representative and approval |
| APR-011 | P0 | Snapshot reconciliation job | Drift is detected and repair is audited |

## 9. M4 — Public discovery and inquiry

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| PUB-001 | P0 | Sanitized public listing projection | Private fields are impossible to select anonymously |
| PUB-002 | P0 | Public search API | Bounded filters, cursor pagination and cache policy |
| PUB-003 | P0 | Search list and responsive filters | URL-preserved filters work without registration |
| PUB-004 | P0 | Map bounds and clustering | Area clusters at wide zoom; listings at close zoom |
| PUB-005 | P0 | Property detail | Approved data, media, map and contact cards render |
| PUB-006 | P0 | Inquiry storage and consent record | Minimal data, selected contact and source are recorded |
| PUB-007 | P0 | Inquiry routing/outbox | Primary and secondary notices are correct and idempotent |
| PUB-008 | P0 | Anonymous abuse controls | Inquiry/search limits resist automation without normal-user failure |
| PUB-009 | P0 | SEO canonical, sitemap and noindex rules | Only eligible public URLs are indexed |
| PUB-010 | P1 | Registered consumer inquiry history | Consumer sees own submitted inquiries only |
| PUB-011 | P2 | Favorites and saved searches | Explicitly deferred from initial vertical slice |

## 10. M5 — Websites, sharing and notifications

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| WEB-001 | P0 | Site/domain migrations and hostname resolver | Only verified hostnames select a site |
| WEB-002 | P0 | Agent public website | Owned plus accepted shares display correctly |
| WEB-003 | P0 | Brokerage public website | All eligible brokerage-owned listings display |
| WEB-004 | P0 | Share grant/accept/revoke/remove workflow | Recipient cannot edit; history preserved |
| WEB-005 | P0 | Dual-agent property contact | Owner/display agent shown and consumer chooses |
| WEB-006 | P0 | Share change notifications | Approved listing changes notify active display agents |
| WEB-007 | P0 | Recipient-removal notification | Owner receives notice and site removes listing |
| WEB-008 | P0 | Agent departure website behavior | Account/site remains; former brokerage inventory disappears |
| WEB-009 | P1 | Basic site branding/profile controls | Safe colors/logo/profile with preview |
| WEB-010 | P1 | Wildcard subdomain deployment | DNS, TLS, cookies and hostname tests pass |
| NTF-001 | P0 | Notification preferences and inbox | Required operational notices cannot be disabled improperly |
| NTF-002 | P0 | Outbox worker retry/dead-letter | Delivery is idempotent and observable |

## 11. M6 — Billing, operations and administration

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| BIL-001 | P0 | Plan, subscription, seat, invoice and payment migrations | JMD/provider IDs/status history represented |
| BIL-002 | P0 | Payment provider sandbox integration | SteadFast never stores raw card data |
| BIL-003 | P0 | Signed idempotent webhook processing | Forged/replayed events rejected |
| BIL-004 | P0 | Entitlement service | Browser cannot grant subscription capability |
| BIL-005 | P0 | One-person/combined-capability billing | Agent-plus-staff/broker pays once under approved plan rules |
| BIL-006 | P1 | Invoice and payment history UI | User and operations see permitted records |
| OPS-001 | P0 | Operations customer context | Scoped support view with reason and audit |
| OPS-002 | P0 | System flag workflow | Operations can notify brokerage but not control content |
| OPS-003 | P0 | Delivery and outbox health | Failures can be retried within capability |
| ADM-001 | P0 | Admin access and audit | MFA, reason and immutable event for elevated actions |
| ADM-002 | P1 | Plan/configuration management | Changes versioned, validated and reversible |

## 12. M7 — External integrations

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| INT-001 | P1 | Canonical approved export model | Contains only authorized approved fields |
| INT-002 | P1 | Channel credential vault/adapter interface | Credentials isolated and rotatable |
| INT-003 | P1 | Distribution queue and delivery attempts | Idempotent retries and dead-letter state |
| INT-004 | P1 | Field/value mapping and validation | Provider-specific errors are actionable |
| INT-005 | P1 | Acknowledgement and reconciliation | External ID/status recorded and drift surfaced |
| INT-006 | P1 | Channel entitlement and brokerage consent | No export without contract, plan and authorization |
| INT-007 | P1 | First contracted channel certification | Written spec and acceptance evidence attached |
| INT-008 | P2 | Additional country/channel adapters | After Jamaica pilot and country/legal analysis |

No channel should be named “live” until commercial permission, current specification, credentials, certification and monitoring exist.

## 13. M8 — Pilot hardening and launch

| ID | Pri | Item | Acceptance |
|---|---|---|---|
| PIL-001 | P0 | Full role and cross-tenant test suite | All matrix cases pass |
| PIL-002 | P0 | Accessibility/manual usability study | Critical novice/accessibility issues resolved |
| PIL-003 | P0 | Performance/load test | Pilot targets and provider quotas validated |
| PIL-004 | P0 | Backup tier and restore drill | Approved RPO/RTO met with recorded evidence |
| PIL-005 | P0 | Incident runbooks and contact rota | Tabletop completes for major scenarios |
| PIL-006 | P0 | Privacy/data inventory and retention configuration | Every personal-data class has owner/purpose/retention |
| PIL-007 | P0 | Counsel-approved legal pack | Terms/notices/agreements approved and published |
| PIL-008 | P0 | Pilot brokerage onboarding and support process | Responsibilities, contacts and escalation tested |
| PIL-009 | P0 | Independent security assessment | No unresolved critical/high finding |
| PIL-010 | P0 | Production readiness review | Named owners approve product, security, legal and operations gates |
| PIL-011 | P1 | Pilot metrics dashboard | Adoption, approval time, inquiry and reliability visible |

## 14. Recommended sprint sequence

1. FND-001 through FND-008.
2. IAM-001 through IAM-010.
3. LST-001 through LST-009.
4. APR-001 through APR-011.
5. PUB-001 through PUB-009.
6. WEB-001 through WEB-008 and NTF-001/002.
7. Billing/operations P0.
8. Pilot hardening P0.
9. First contracted integration only after its external dependency is ready.

Keep each sprint vertically demonstrable. Avoid building a full set of screens on mock data before the authorization, data and workflow path exists.

## 15. Backlog risks and dependencies

| Risk/dependency | Effect | Response |
|---|---|---|
| External feed terms/spec unavailable | Integration cannot be estimated/certified | Build adapter framework; keep channel disabled |
| Free hosting/database limits | Pilot reliability/backups may be insufficient | Measure early; approve paid tier before live data |
| Legal entity/privacy decisions missing | Legal pack cannot be finalized | Counsel checklist and launch blocker |
| Map licence/address quality | Search/location experience may vary | Provider spike and Jamaica address test set |
| Payment provider/currency choice | Billing implementation delayed | Provider decision before M6 |
| Complex RLS | Security/performance defects | Policy patterns, indexes and automated matrix |
| Novice usability | Adoption failure | Prototype and test vertical slice early |

## 16. Explicitly deferred

- Vacation rentals.
- Transaction/closing management, commissions and trust accounting.
- Native iOS/Android applications.
- Public partner API and third-party developer portal.
- Multi-broker membership for one agent.
- Automated AI-generated listing content without separate policy.
- Belize or other country rollout before Jamaica pilot evidence and jurisdiction review.
- Favorites/saved searches if schedule threatens P0 professional workflow.
