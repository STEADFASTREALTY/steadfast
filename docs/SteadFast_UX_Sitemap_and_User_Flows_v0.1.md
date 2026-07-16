# SteadFast UX Sitemap and User Flows

**Version:** 0.1  
**Prepared:** 16 July 2026  
**Status:** MVP interaction baseline  
**Design goal:** A novice user can complete core work without formal training

## 1. Experience principles

- Speak in real-estate language, not database or workflow terminology.
- Show one primary action per screen and explain what happens next.
- Preserve work automatically and make status visible at all times.
- Prevent invalid actions before submission and explain how to correct them.
- Keep public browsing fast, visual and usable without registration.
- Make ownership, representative, approval and sharing relationships explicit.
- Use the same patterns across agent, staff and broker workspaces.
- Meet WCAG 2.2 AA as the launch target, including keyboard, focus, contrast, labels and error recovery.

## 2. Role navigation

~~~mermaid
flowchart TD
  Home[Public home] --> Search[Search and map]
  Search --> Detail[Property detail]
  Detail --> Contact[Choose contact agent]
  SignIn[Sign in] --> Router{Capabilities}
  Router --> Consumer[Saved activity]
  Router --> Agent[Agent workspace]
  Router --> Staff[Approval and agent management]
  Router --> Broker[Brokerage control]
  Router --> Ops[SteadFast operations]
  Router --> Admin[SteadFast administration]
  Agent --> Listings[My listings]
  Agent --> Shares[Display shares]
  Staff --> Approvals[Approval queue]
  Broker --> Team[Staff and agents]
~~~

## 3. Public sitemap

| Page | Purpose | Primary action |
|---|---|---|
| Home | Search entry, featured areas, value proposition | Search properties |
| Search and map | Filter, sort, cluster and compare approved listings | Open a property |
| Property detail | Media, facts, map, owner/display agent and disclosure | Choose who to contact |
| Agent website | Agent profile, owned and accepted shared listings | Browse this agent's listings |
| Brokerage website | Brokerage profile and all published brokerage listings | Browse brokerage listings |
| Register/sign in | Create free consumer account or access workspace | Continue |
| Help, privacy, terms | Support and legal information | Read or contact support |

Registration is optional for browsing and contacting. A registered consumer may later save searches, favorites and inquiry history when those features are scheduled.

## 4. Authenticated sitemap

### 4.1 Shared account

- Dashboard
- Profile and contact information
- Security and active sessions
- Notification preferences
- Subscription and invoices, when applicable
- Help and support

### 4.2 Agent workspace

- Overview: action list, listing status, recent inquiries and notifications
- Listings: drafts, returned, pending approval, published, unassigned and closed
- Create listing: guided step-by-step entry
- Listing detail: approved view, pending changes, history, media, sharing and inquiries
- Display shares: shown on my site, shared by me, removed
- Website: profile, branding, contact options and preview
- Inquiries: new, contacted, closed

### 4.3 Broker staff workspace

- Approval queue
- Review detail and version comparison
- Agent directory and status
- Listing assignment and unassigned queue
- Brokerage listing inventory
- Audit history

### 4.4 Broker workspace

The broker inherits all staff functions and adds:

- Brokerage profile and public website
- Staff invitations, capabilities and deactivation
- Agent invitations, approvals, status and departure
- Subscription, seats, invoices and payment method
- Integration and publication settings
- Brokerage reporting

### 4.5 SteadFast operations

- Customer search and account context
- Subscription and invoice service
- Support cases
- System-flag monitoring
- Notification and external delivery status
- Platform service health

Operations cannot approve, reject, edit, publish or suspend brokerage listing content. It can document a flag and notify the brokerage.

### 4.6 SteadFast administration

- Platform users and elevated access
- Plans and entitlements
- Global configuration and feature flags
- Integration credentials and channel configuration
- Audit search and export
- Security, incident and system controls

## 5. Dashboard behavior

After sign-in, the system routes the person to a capability-aware dashboard. A person with more than one capability can switch work areas without a second account or payment.

The dashboard prioritizes:

1. Work blocking publication or customer response.
2. Items returned for correction.
3. New inquiries and notifications.
4. Subscription or security issues.
5. General reporting.

Counts are clickable and use plain labels such as “3 listings waiting for approval.” Empty states teach the first action and never show a blank table.

## 6. Public property search flow

1. Visitor enters area, community, parish, property type, intent or price.
2. Search opens in a synchronized list-and-map layout.
3. At wide zoom, the map shows area clusters and result counts.
4. At close zoom, individual approved listings appear.
5. Filters update the result count before application; mobile uses a filter sheet.
6. Opening a card shows property detail without losing search state.
7. Exact address precision follows the approved listing setting.
8. The visitor chooses the owner agent or displaying agent before sending an inquiry.
9. Both relevant agents receive the inquiry notification; the selected agent is the primary recipient.
10. The visitor sees a receipt and expected response message.

### Public search rules

- Never show drafts, pending changes, unassigned listings or expired publication.
- Clearly label sale versus long-term rent and the currency.
- Preserve filters in the URL for sharing.
- Do not require an account to contact an agent.
- Rate-limit and abuse-check inquiry submission without creating confusing puzzles for normal users.

## 7. Agent onboarding flow

1. Agent receives or opens a brokerage-linked invitation/application.
2. Agent creates or signs into one SteadFast account.
3. Agent confirms contact information, licence details required by the brokerage, and terms.
4. Broker or staff reviews and approves or denies the application.
5. Agent sees “Waiting for brokerage approval” until approved.
6. On approval, the agent selects a plan if not covered by brokerage billing and configures the website profile.
7. The first-listing checklist opens.

SteadFast does not verify listing documents for the brokerage. The brokerage is responsible for agent and listing verification.

## 8. Create-listing flow

Use a seven-step wizard with save-and-exit:

1. **Purpose and property:** sale or long-term rent, property type, existing property match.
2. **Location:** address, map confirmation, public location precision.
3. **Details:** beds, baths, size, land, amenities and description.
4. **Price and terms:** amount, currency, availability and relevant terms.
5. **Media:** photos, order, captions and primary image.
6. **Representative and visibility:** active agent, public/semi-public/private state, contact details.
7. **Review and submit:** validation summary, brokerage attestation and submission.

The agent sees “Draft — only you and authorized brokerage users can see this.” Submission changes the state to “Waiting for brokerage approval” and locks that submitted version. The agent may create a newer correction only through the approved resubmission rules.

## 9. Broker approval flow

1. Reviewer opens the queue ordered by age and urgency.
2. Queue cards show submitter, listing, requested action, changed fields and waiting time.
3. Review detail shows the current approved version beside proposed changes.
4. Material changes are highlighted by field, including removed values.
5. Reviewer can preview the future public page.
6. Reviewer chooses approve, return for changes or reject.
7. Return/reject requires a clear reason visible to agent and brokerage.
8. Approval runs an eligibility check and publishes atomically.
9. All relevant users receive a notification and the history shows actor, time, decision and version.

Self-approval by a broker or authorized staff member is allowed. The interface labels and logs it as self-approval.

## 10. Material change flow

1. Agent opens a published listing and selects “Propose changes.”
2. The approved public version remains visible while the agent edits a new version.
3. The system identifies whether the change is material.
4. Material edits go to approval; minor non-public edits may follow a later policy.
5. On approval, the public snapshot changes once.
6. Owner agent and all active display-share agents receive a change notification.
7. Rejected or returned versions remain in history and can be corrected and resubmitted.

## 11. Sharing flow

1. Owner agent finds another active agent and selects “Allow display.”
2. The system explains: the recipient may show the listing but cannot edit it.
3. The recipient receives a notification and accepts or declines display.
4. Accepted listing appears on the recipient's site with both agents identified.
5. Recipient can remove it from their site at any time.
6. Removal notifies the owner and preserves the share record.
7. Owner can revoke the share; this also notifies the recipient.
8. Approved listing changes notify every active display recipient.

Sharing is advertising permission and does not require broker approval. It never changes ownership or representative assignment.

## 12. Agent departure and transfer flow

1. Broker or authorized staff ends the agent's brokerage membership.
2. The system shows the affected listing count and requires confirmation.
3. Every published listing represented by that agent is immediately removed from public display.
4. Listings remain owned by the former brokerage and move to “Unassigned — representative required.”
5. Shares derived from the unpublished listing stop displaying.
6. Agent account and personal website remain active, but former brokerage listings disappear.
7. The brokerage assigns a new active agent and submits the required publication action for approval.
8. If the person joins another brokerage, the same account is used. Old brokerage listings do not transfer.

## 13. Inquiry flow

The property page presents contact cards for the listing owner agent and, when applicable, the displaying agent. The consumer selects one primary contact, enters the minimum contact information, chooses preferred contact method, accepts the privacy notice and submits.

The selected agent receives the full actionable notification. The other relevant agent receives notice of the inquiry according to brokerage policy. The system stores source site, listing/version, selected recipient, consent record, timestamps and delivery status.

## 14. Operations flag flow

1. Automated monitoring or a person raises a system flag.
2. Operations reviews the technical evidence and account context.
3. Operations cannot edit or suspend the listing.
4. Operations sends the brokerage a notice and records the communication.
5. Brokerage resolves content or dispute issues through its own authority.
6. Operations may resolve only system, delivery, billing or security issues within its permissions.

## 15. Status language

| Internal concept | User-facing label |
|---|---|
| draft | Draft |
| pending approval | Waiting for brokerage approval |
| returned | Changes requested |
| rejected | Not approved |
| approved/public | Published |
| approved/private | Approved, not public |
| unassigned | Needs an agent representative |
| withdrawal pending | Removal waiting for approval |
| sold/rented pending | Closing status waiting for approval |
| share active | Displayed on another agent's site |

Every status includes a one-line explanation and the next available action.

## 16. Screen standards

- Use a left workspace navigation on desktop and a simple bottom/menu pattern on mobile.
- Keep forms single-column unless paired values are easy to understand.
- Show required fields explicitly; validate on blur and at step completion.
- Autosave drafts with “Saved” time and recovery after interruption.
- Use tables for staff queues on desktop and cards on mobile.
- Preserve filter, sort and page state after reviewing an item.
- Use confirmation dialogs only for consequential actions and state the effect.
- Never use color alone to communicate status.
- Provide skeleton, empty, error, offline and access-denied states.

## 17. Accessibility and content

- Keyboard access and visible focus for all controls.
- Proper headings, landmarks, labels, descriptions and error summaries.
- Alternative text workflow for listing images; decorative images are ignored by assistive technology.
- Map results have an equivalent list and filters.
- Minimum 44 by 44 CSS pixel touch targets where practical.
- Dates, prices, measurements and Jamaican addresses use familiar local formats.
- Avoid jargon such as “tenant,” “projection,” “RLS,” or “mutation” in the interface.

## 18. Usability validation

Before pilot, test with at least:

- a new agent with low technical confidence;
- an experienced agent migrating from another platform;
- broker staff processing a review queue;
- a broker managing team access;
- a visitor searching on a low-end mobile device;
- a keyboard and screen-reader user.

Core success targets are: first listing draft without help, approval decision without training, public search to inquiry without registration, and correct understanding of ownership versus display sharing.

## 19. UX acceptance criteria

- A novice agent can create and submit a valid listing from the dashboard.
- A reviewer can see every proposed change and the current approved value.
- No user can mistake a pending edit for a published edit.
- Shared listings clearly identify both agents and allow consumer choice.
- Agent departure produces an understandable unassigned queue and removes affected public listings.
- Every destructive or publication-changing action states its consequence.
- Public search works with list-only navigation and on mobile.
- Operations screens do not expose content controls they are not permitted to use.

## 20. Open design decisions

- Brand identity, component library and final visual direction.
- Map/geocoding provider and public address precision.
- Consumer favorites and saved-search timing.
- Exact minor-versus-material edit policy.
- Email/SMS notification choices and opt-out rules.
- Whether share acceptance is automatic or explicit for the first pilot.
