# SteadFast Roles and Permissions Matrix

**Version:** 0.1 - Planning Draft  
**Prepared:** July 2026  
**Status:** Product and authorization baseline  
**Applies to:** SteadFast MVP for Jamaican brokerages and agents

## 1. Purpose

This document defines who may view or perform each SteadFast action. It is the authoritative MVP baseline for application authorization, Supabase Row Level Security policies, protected routes, API checks, acceptance tests, and audit events.

The brokerage is the root of the professional hierarchy. Brokerages own approved listings. Agents represent listings, and every publicly displayed listing requires an active assigned agent. SteadFast operations supports the platform but does not exercise brokerage approval authority or decide professional disputes.

## 2. Roles

| Role | Position and scope |
|---|---|
| Visitor | An unauthenticated public user. May browse eligible public content and contact an agent. |
| Registered consumer | A free authenticated public user. Has visitor capabilities plus personal favourites, saved searches, and inquiry history. |
| Agent | An approved professional belonging to one active brokerage. Creates listing work, represents assigned listings, shares approved listings, operates a personal website, and manages assigned inquiries. |
| Broker staff | A brokerage member with permissions delegated by the broker. May also hold the agent role. Staff access applies only inside the active brokerage. |
| Broker | The principal controller of one brokerage. Includes all broker-staff capabilities and controls company membership, permissions, billing, integrations, and the brokerage website. May also hold the agent role. |
| SteadFast operations | Internal customer-service and commercial staff. Supports accounts, billing records, flags, platform issues, and feed delivery without approving listings or resolving brokerage disputes. |
| SteadFast administrator | Restricted internal platform administrator. Manages internal access, system configuration, plans, integrations, security records, and audited high-risk controls. Does not replace the brokerage in ordinary listing decisions. |

## 3. Authorization principles

1. **Deny by default.** An action is refused unless an explicit permission and valid resource scope allow it.
2. **Server and database enforcement.** Hiding a button is not authorization. Every protected action is checked on the server and through Supabase Row Level Security or an equivalent database policy.
3. **Brokerage isolation.** Professional users may not access another brokerage's private records merely by knowing or guessing an identifier.
4. **Multiple roles, one account.** A broker or staff member may also be an agent. Effective permissions are the safe union of active roles, constrained by brokerage, assignment, record state, and explicit delegation. The person pays once for one professional seat.
5. **One active brokerage.** An agent belongs to only one brokerage at a time in the MVP. Former memberships retain history but grant no current access.
6. **Listings belong to brokerages.** Assignment gives an agent working and advertising responsibility, not ownership of the listing record.
7. **Approval separation by workflow.** Agent edits are proposals. The current approved version stays public until an authorized reviewer approves the proposed version.
8. **Authorized self-approval.** A broker or staff member who also acts as an agent may approve their own submission only when they hold the listing-approval permission. The audit event must identify self-approval.
9. **Least privilege for staff.** Broker staff receive named permissions rather than automatic full brokerage control.
10. **No privilege through sharing.** A display share allows advertising only. It never grants listing ownership, editing, approval, reassignment, or access to private brokerage data.
11. **No privilege through subscription.** Payment or plan entitlement enables features but never grants a role or expands record scope.
12. **Audited privileged actions.** Approval, permission, membership, assignment, billing, integration, security, and administrative changes record actor, effective role, scope, reason, time, and safe before/after details.
13. **No routine impersonation.** Internal staff do not silently act as customers. Any future assisted-access feature must be explicit, time-limited, consent-aware, and fully audited.
14. **Non-guessable public identifiers.** Internet-facing record identifiers use random opaque values rather than sequential IDs.

## 4. Permission notation

| Mark | Meaning |
|---|---|
| Public | Allowed for eligible public data without authentication. |
| Own | Allowed only for the person's own account, submission, website, inquiry, or consumer data. |
| Assigned | Allowed only when the agent is the active representative of the listing. |
| Brokerage | Allowed only for records owned by the user's active brokerage. |
| Delegated | Allowed in the active brokerage only when the broker grants the named staff permission. |
| Support | Limited operational access needed for an assigned support or billing function; sensitive fields remain masked. |
| Platform | Platform-wide administrative access requiring the relevant internal permission. |
| No | Not allowed through the normal product workflow. |

## 5. Detailed matrix

### 5.1 Public discovery and consumer accounts

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| View eligible public listings, maps, agents, and brokerages | Public | Public | Public | Public | Public | Public | Public |
| Search and filter public listings | Public | Public | Public | Public | Public | Public | Public |
| Submit a property or viewing inquiry | Public | Own | Own | Own | Own | Support | Platform |
| Select the contact agent on a shared listing | Public | Own | Own | Own | Own | Support | Platform |
| Create and manage a consumer profile | No | Own | Own account | Own account | Own account | Support | Platform |
| Manage favourites | No | Own | Own | Own | Own | No | Platform support only |
| Manage saved searches | No | Own | Own | Own | Own | No | Platform support only |
| View signed-in inquiry history | No | Own | Own consumer history | Own consumer history | Own consumer history | Support | Platform |
| View another user's private consumer data | No | No | No | No | No | Support, masked | Platform, audited |

### 5.2 Registration, brokerage membership, and professional roles

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| Apply to join a brokerage as an agent | No | Own | Own | Own | Own | Support view | Platform support |
| Approve or deny an agent application | No | No | No | Delegated | Brokerage | No | No ordinary authority |
| Activate or deactivate an agent's brokerage membership | No | No | No | Delegated | Brokerage | No | Platform emergency only* |
| View brokerage agent directory and membership status | No | No | Own membership | Delegated | Brokerage | Support | Platform |
| Revoke the agent's former-brokerage access on departure | No | No | No | Delegated | Brokerage | No | Platform emergency only* |
| Appoint or remove broker staff | No | No | No | No | Brokerage | No | Platform support only* |
| Grant or revoke broker-staff permissions | No | No | No | No | Brokerage | No | Platform support only* |
| Transfer principal broker responsibility | No | No | No | No | Brokerage, controlled | No | Platform, controlled* |
| Change brokerage ownership or close brokerage account | No | No | No | No | Brokerage, controlled | Support process | Platform, controlled* |
| Assign a person both staff and agent roles | No | No | No | No | Brokerage | No | Platform support only* |
| Join a second active brokerage in the MVP | No | No | No | No | No | No | No |

\* Requires a defined controlled procedure, strong authentication, reason entry, and immutable audit event. It must not be a casual support shortcut.

### 5.3 Listing creation, versions, and lifecycle

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| View public listing version | Public | Public | Public | Public | Public | Public | Public |
| View professional-network listing | No | No | Active professional | Active professional | Active professional | Support only | Platform |
| View private draft or pending listing | No | No | Assigned or submitter | Delegated | Brokerage | No | Platform security/support only* |
| Create a listing draft | No | No | Assigned creator | Own agent role | Own agent role | No | No ordinary authority |
| Edit an unsubmitted draft | No | No | Assigned or creator | Own agent role | Brokerage | No | No ordinary authority |
| Submit a new listing for approval | No | No | Assigned | Own agent role | Brokerage | No | No |
| Propose a material change to an active listing | No | No | Assigned | Own agent role or delegated | Brokerage | No | No |
| Withdraw or replace a pending proposal | No | No | Own submission | Own submission or delegated | Brokerage | No | No |
| View before-and-after approval comparison | No | No | Assigned or submitter | Delegated | Brokerage | No | Platform security/support only* |
| Approve, reject, or return a listing submission | No | No | No | Delegated | Brokerage | No | No ordinary authority |
| Approve one's own submission | No | No | No | Delegated plus agent role | Broker plus agent role | No | No ordinary authority |
| Request sold, rented, withdrawn, expired, removal, or republication status | No | No | Assigned | Own agent role or delegated | Brokerage | No | No |
| Approve terminal status or republication | No | No | No | Delegated | Brokerage | No | No ordinary authority |
| Permanently delete a listing or its approval history | No | No | No | No | No | No | No; records are archived |
| Archive an approved listing through workflow | No | No | Request only | Delegated approval | Brokerage | No | No ordinary authority |
| Reassign an unassigned listing to an active brokerage agent | No | No | No | Delegated | Brokerage | No | No ordinary authority |
| View listing approval and assignment history | No | No | Relevant assigned/submitted listing | Delegated | Brokerage | No | Platform security/support only* |

### 5.4 Agent departure and listing continuity

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| Keep the person's login and personal website after departure | N/A | N/A | Own | Own account | Own account | Support | Platform |
| Access former brokerage private records after departure | No | No | No | No after membership ends | Brokerage only | No | Platform security/support only* |
| Remove departed agent's represented listings from all public displays | Automatic | Automatic | Automatic | Automatic | Automatic | Monitor system issue | Monitor system issue |
| Retain those listings as unassigned brokerage records | No | No | No | Delegated view | Brokerage | No | Platform security/support only* |
| Assign a replacement representative | No | No | No | Delegated | Brokerage | No | No ordinary authority |
| Republish after reassignment and approval | No | No | Submit if assigned | Delegated approval | Brokerage | No | No ordinary authority |
| Transfer former-brokerage listings to the agent's new brokerage | No | No | No | No | No | No | No |

### 5.5 Listing display sharing

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| Grant an agent permission to display a listing | No | No | Assigned | Own agent role if assigned | Own agent role if assigned | No | No |
| Accept or decline a display share | No | No | Own | Own agent role | Own agent role | No | No |
| Display a shared listing on personal website | No | No | Own active share | Own agent role | Own agent role | No | No |
| Edit, approve, reassign, or claim ownership through a share | No | No | No | No | No | No | No |
| Remove a shared listing from the displaying agent's own website | No | No | Own display | Own agent role | Own agent role | No | No |
| Revoke a share as the assigned owner agent | No | No | Assigned | Own agent role if assigned | Own agent role if assigned | No | No |
| View share history | No | No | Participating agent | Delegated | Brokerage | Support delivery only | Platform |
| Receive approved-change, removal, or revocation notifications | No | No | Participating agent | Participating agent | Participating agent | No | Platform monitoring |

Sharing does not require broker approval. Every shared public display shows both the displaying agent and listing-owner agent. The consumer chooses the primary contact, and both agents receive the inquiry notification.

### 5.6 Agent and brokerage websites

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| View public agent or brokerage website | Public | Public | Public | Public | Public | Public | Public |
| Edit personal agent profile, branding, and contact preferences | No | No | Own | Own agent role | Own agent role | Support limited | Platform support |
| Configure which eligible owned/shared listings appear on personal site | No | No | Own eligible displays | Own agent role | Own agent role | No | Platform support |
| Edit brokerage profile, branding, offices, and directory settings | No | No | No | Delegated | Brokerage | Support limited | Platform support |
| Configure featured brokerage-owned listings | No | No | No | Delegated | Brokerage | No | Platform support |
| Publish an ineligible, unapproved, unassigned, or inactive listing | No | No | No | No | No | No | No |
| Add a Contact Brokerage action to a property page | No | No | No | No | No | No | No in MVP |

### 5.7 Inquiries and notifications

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| View inquiry submitted to the agent | No | Own history only | Assigned recipient | Own agent role; delegated aggregate only | Brokerage aggregate; content only where authorized | Support delivery only | Platform, audited |
| Acknowledge or mark an inquiry handled | No | No | Assigned recipient | Own agent role | Own agent role | No | Platform support only |
| Reassign an inquiry between agents | No | No | No | Delegated | Brokerage | No | Platform support only* |
| View private notes of an unrelated agent | No | No | No | No unless specifically delegated | Brokerage under policy | No | Platform security/support only* |
| Manage own notification preferences | No | Own | Own | Own | Own | Own | Own |
| Send platform or account-service notices | No | No | No | Brokerage notices if delegated | Brokerage | Support | Platform |
| View notification delivery status | No | Own | Own | Delegated brokerage events | Brokerage | Support | Platform |

### 5.8 Brokerage administration, reports, billing, and integrations

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| View personal subscription status | No | No | Own | Own | Own | Support | Platform |
| View brokerage plan, capacity, invoices, and payment status | No | No | No unless payer policy allows | Delegated | Brokerage | Support | Platform |
| Change brokerage plan or seat funding arrangement | No | No | Own agent plan only | No unless delegated | Brokerage | Support process | Platform |
| Create invoices or record pilot payments and adjustments | No | No | No | No | View/pay | Support | Platform |
| Change billing grace or suspension state | No | No | No | No | Request/view | Support, audited | Platform |
| Delete billing history | No | No | No | No | No | No | No; correct by audited adjustment |
| View brokerage operational reports | No | No | Own metrics | Delegated | Brokerage | Support summary | Platform |
| Export brokerage business data | No | No | Own permitted data | Delegated | Brokerage | Support controlled | Platform controlled |
| Configure brokerage feed destinations and permissions | No | No | No | Delegated only if expressly granted | Brokerage | Support setup | Platform configuration |
| Send listings to an external destination | No | No | No direct bypass | Delegated, eligible workflow | Brokerage, eligible workflow | Monitor/retry delivery only | Platform integration control |
| View feed delivery errors and history | No | No | Assigned listing summary | Delegated | Brokerage | Support | Platform |
| View or reveal integration credentials | No | No | No | No | No secret reveal | No secret reveal | Enter/rotate only; never reveal after entry |

### 5.9 Flags, support, audit, and platform administration

| Action | Visitor | Consumer | Agent | Broker staff | Broker | Operations | Admin |
|---|---|---|---|---|---|---|---|
| Submit a listing or account report/flag | Public | Own | Own | Own | Own | Support | Platform |
| Record and classify a flag | No | No | No | Brokerage response only | Brokerage response | Support | Platform |
| Notify the responsible broker and track response | No | No | No | Respond if delegated | Brokerage | Support | Platform |
| Suspend or unpublish a listing because of an ordinary flag | No | No | No | Brokerage approval workflow | Brokerage approval workflow | No | No ordinary authority* |
| Decide listing ownership, commission, or agent disputes | No | No | No | Brokerage policy | Brokerage | No | No |
| Open and manage a support case | No | Own | Own | Own | Own | Support | Platform |
| View append-only business audit history | No | No | Relevant own/listing events | Delegated | Brokerage | Support-relevant events | Platform |
| Edit or delete audit events | No | No | No | No | No | No | No |
| Manage SteadFast internal staff roles | No | No | No | No | No | No | Platform, restricted |
| Manage plans, global limits, and controlled configuration | No | No | No | No | No | View/use assigned tools | Platform, restricted |
| Manage platform integration credentials | No | No | No | No | No | Monitor only | Platform, restricted |
| View security events and administrative logs | No | No | No | No | No | Assigned support subset | Platform security permission |
| Use emergency legal or security content control | No | No | No | No | No | No | Disabled until policy approval* |

\* Emergency legal/security authority remains a product and legal policy decision. It must not be implemented as unrestricted listing editing or ordinary support access.

## 6. Broker-staff permission catalogue

The MVP should store broker staff as a brokerage membership plus explicit permission grants. A broker automatically has every brokerage permission but retains principal-broker-only controls.

| Permission key | Allows | Does not allow |
|---|---|---|
| `listing.review` | Review, return, reject, or approve listing versions and lifecycle requests inside the brokerage. | Editing an agent's proposal silently, deleting history, or accessing another brokerage. |
| `listing.manage` | View brokerage portfolio, correct non-material workflow metadata, and coordinate listing work. | Publishing material changes without approval. |
| `listing.reassign` | Assign unassigned brokerage listings to active brokerage agents. | Transferring ownership to another brokerage. |
| `agent.manage` | Review applications, activate/deactivate memberships, and view agent status. | Appointing the principal broker or overriding protected broker controls. |
| `staff.manage_limited` | Invite or manage lower-privilege staff if the broker enables this delegation. | Granting permissions the acting staff member does not hold; managing the broker. |
| `brokerage.profile` | Edit approved company profile, offices, branding, directory, and website settings. | Changing legal ownership or principal broker. |
| `inquiry.manage` | View permitted brokerage inquiry queues and reassign inquiries under brokerage policy. | Viewing unrelated consumer records or exporting contacts without authorization. |
| `report.view` | View brokerage operational reports and aggregates. | Viewing another brokerage or raw security logs. |
| `audit.view` | View brokerage approval, membership, assignment, and share history. | Editing or deleting audit events. |
| `billing.view` | View plan, usage, invoice, and payment status. | Recording SteadFast payments or changing plan prices. |
| `integration.manage` | Configure authorized brokerage distribution choices and review delivery status. | Viewing platform secrets or bypassing eligibility and approval checks. |

For the simplest launch experience, the interface may offer presets such as **Approvals**, **Agent Manager**, **Office Administrator**, and **Reporting**, but the stored authorization must resolve to explicit permission keys.

## 7. Resource-scope rules

Authorization is determined from all of the following, not from role name alone:

- authenticated person and session assurance level;
- active account state and professional subscription entitlement;
- active brokerage membership and brokerage account state;
- role assignments and delegated permission keys;
- target brokerage ownership;
- listing assignment, submitter, and share participation;
- listing lifecycle, approval version, and visibility;
- inquiry recipient and source website;
- support case assignment or documented operational purpose;
- whether the action is high risk and requires re-authentication, confirmation, or reason entry.

Public eligibility must fail closed. A listing appears publicly only when its approved version is active, public, owned by an active brokerage, covered by an active entitlement, and assigned to an active agent. If any condition becomes false, it is removed from search, maps, agent sites, brokerage sites, shares, and external feeds.

## 8. Data-protection requirements

- Supabase tables containing brokerage, listing, inquiry, billing, audit, or internal data must have Row Level Security enabled.
- The browser must never receive a Supabase service-role or secret key.
- Administrative database access is server-only and uses purpose-specific functions or services rather than a general client escape hatch.
- All API routes and server actions must repeat the permission and resource-scope check; middleware or page routing alone is insufficient.
- State-changing cookie-authenticated requests require cross-site request protection and runtime input validation.
- Sensitive responses use private/no-store caching and never enter shared public caches.
- Internal support views minimize and mask personal information unless the assigned task requires it.
- High-risk internal roles require multi-factor authentication before pilot access.
- Membership, permission, approval, reassignment, billing, integration, export, and administrative events are append-only and queryable by authorized reviewers.

## 9. Required authorization tests

1. A visitor can search and inquire but cannot retrieve private, professional-network, consumer, or brokerage data.
2. A consumer can access only their own favourites, saved searches, profile, and signed-in inquiry history.
3. An agent cannot access another brokerage's drafts, inquiries, agents, reports, or audit history by changing an identifier.
4. An agent can edit only permitted draft/proposal data for an assigned listing and cannot overwrite the approved version.
5. An unapproved, inactive, unassigned, or unsubscribed listing never appears in any public or external channel.
6. A displaying agent can remove a share from their site but cannot edit, approve, reassign, or claim the listing.
7. Staff without `listing.review` cannot approve through the interface, API, database client, or crafted request.
8. Staff with `listing.review` may self-approve only when they also hold the agent role; the audit record identifies self-approval.
9. Staff cannot grant permissions they do not hold or change protected broker controls.
10. Deactivating an agent membership immediately removes former-brokerage access and unpublishes represented listings until reassignment and approval.
11. SteadFast operations can perform assigned billing and support work but cannot approve, edit, suspend, or resolve an ordinary brokerage listing dispute.
12. Administrative actions require the correct internal permission, reason, confirmation where applicable, and immutable audit event.
13. Deleting or directly modifying an audit event is refused for every application role.
14. A dual-role person uses one account and one professional seat; changing roles never duplicates identity or billing.

## 10. Decisions confirmed by this matrix

- Broker staff is not a single all-powerful role; it is delegated brokerage access.
- Brokers inherit all staff capabilities and retain protected company-level controls.
- Agents, staff, and brokers may coexist on one person/account and pay once.
- Authorized broker staff may approve their own listing submissions.
- Brokerages own listings; active agents represent them.
- Agent sharing is advertising permission only and requires no broker approval.
- SteadFast operations does not approve listings, suspend them for ordinary flags, or decide brokerage disputes.
- Public property pages prioritize agent contact and do not include a Contact Brokerage action in the MVP.
- Historical listing, approval, share, membership, billing, and audit records are retained rather than destructively deleted.

## 11. Open decisions

These do not block the authorization foundation but must be resolved before the affected feature launches:

- Whether lower-privilege staff may manage other staff through `staff.manage_limited`, or only the broker may manage staff in the MVP.
- Whether brokerage-wide inquiry content is visible to the broker by default or only through an explicit `inquiry.manage` grant and documented brokerage policy.
- Exact re-authentication and dual-approval requirements for principal broker transfer, data export, integration changes, and internal administration.
- The legal and operational policy for emergency content restriction, including who may authorize it, appeal handling, and audit review.
- Retention periods and consumer correction/deletion procedures required by applicable privacy law and business obligations.
- Whether an inactive-but-paid agent website shows a profile-only page or a specific status message while the agent has no active brokerage.

## 12. Implementation handoff

The next database and application architecture work must translate this document into:

1. stable role and permission identifiers;
2. brokerage membership and permission-grant tables;
3. centralized server authorization functions;
4. Supabase Row Level Security policies for every protected table;
5. explicit listing state-transition guards;
6. append-only audit events;
7. automated positive and negative permission tests; and
8. a versioned change process so later permission changes cannot silently alter approved business rules.

