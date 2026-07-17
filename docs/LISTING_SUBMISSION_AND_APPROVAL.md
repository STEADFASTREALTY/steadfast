# Listing Submission and Brokerage Approval

Status: implemented foundation  
Last updated: 2026-07-17

## Purpose

This milestone implements SteadFast's first complete brokerage-controlled listing decision cycle. An assigned agent can freeze a complete draft and submit it. A principal broker or broker staff member with explicit `listing.review` permission can approve it, request corrections, or reject it. Every submitted and decided snapshot is retained.

SteadFast operations and administrators receive no ordinary listing-approval authority.

## Agent submission

The agent interface presents a final confirmation after the editable form and private image gallery. Submission is accepted only when all of these rules pass in one database transaction:

- the caller is authenticated and has an active person and brokerage membership;
- the caller is the listing's current active assigned representative;
- the caller has `listing.submit` through an active role or explicit permission;
- the listing is still a draft and the supplied optimistic lock is current;
- the supplied version is the listing's current working draft;
- no image validation is still pending;
- rejected and removed media links are excluded from the submitted snapshot;
- at least one validated property image remains;
- the version content, ordered media metadata, property, and assignment are hashed;
- submitter and freeze timestamps are recorded;
- the listing enters `pending_initial_approval`;
- lifecycle and privacy-safe audit events are appended.

The browser inserts only into `submit_listing_version_commands`. It cannot directly update listings, versions, audit history, or submission timestamps. Command payload rows are not stored.

## Brokerage review queue

`/workspace/reviews` is available only to the principal broker and staff with active `listing.review` permission. The queue is explicitly filtered to the active brokerage and contains only listings currently awaiting an initial decision.

The listing review screen shows:

- the immutable submitted title, description, property facts, price, purpose, and visibility request;
- the ordered, validated private images through short-lived signed URLs;
- the current version and lifecycle state;
- prior brokerage decisions and comments;
- whether a prior decision was an authorized self-approval.

A reviewer cannot edit the submitted snapshot.

## Decision outcomes

### Approve

- Rechecks active brokerage review authority.
- Rechecks the submitted version identity, active representative, and validated media.
- Appends one `listing_reviews` record.
- Marks the exact version `approved` with its approval timestamp.
- Sets `current_approved_version_id` to that version.
- Moves the listing to `approved_inactive`.

Public activation deliberately remains fail closed. The later publishing projection must recheck visibility, brokerage eligibility, representative eligibility, subscription/channel rules, and public data classification before changing the lifecycle to `active` or exposing content.

### Changes requested

- Requires a reviewer comment.
- Retains the submitted version as `changes_requested`.
- Creates a new `working_draft` based on that retained version.
- Copies the validated ordered media links into the correction draft.
- Attributes the correction draft to the original submitter.
- Returns the listing to `draft` without changing approved public content.

The assigned agent can edit and resubmit the new version through the same workflow.

### Reject

- Requires a reviewer comment.
- Retains the submitted version as `rejected`.
- Returns the listing record to a private draft lifecycle without creating an editable version automatically.
- Preserves the full review and audit history.

## Authorized self-approval

A person who is both the assigned agent and an authorized reviewer may submit and approve their own version. The system calculates self-approval from the authenticated reviewer and recorded submitter; the browser cannot choose the value. `listing_reviews.is_self_approval` and the audit event both record it.

## Atomicity and concurrency

- Listing rows and target version rows are locked during submission and decision transactions.
- Optimistic locking prevents submission from an outdated browser tab.
- Only one working or submitted proposal can exist because of the existing partial unique index.
- A decision verifies that the supplied version is still submitted and the listing is still pending.
- Matching review rows must exist before the immutable snapshot trigger permits a submitted-to-decision transition.
- Duplicate equivalent decisions by the same reviewer are treated as safe no-ops; conflicting later decisions are rejected.
- Any failed database step rolls back the entire submission or decision.

## Security and access controls

- Both command tables have RLS enabled and grant authenticated users only `INSERT`.
- The private triggers perform resource-level brokerage, assignment, state, and permission checks.
- Authorization uses database membership and permission records, not user-editable metadata or browser role claims.
- The command-processing functions live in the unexposed `app_private` schema with revoked direct execution.
- Direct writes to versions, reviews, listings, and audit records remain denied.
- User comments are bounded to 4,000 characters and rendered through React's escaped text output.
- Public listing activation is not performed by this milestone.

## Verification

The database suite covers:

- anonymous and unrelated-agent submission denial;
- active representative and validated-media requirements;
- immutable snapshot attribution, timestamps, and hashing;
- optimistic lifecycle and lock changes;
- direct-write and command-read denial;
- staff denial before `listing.review` delegation;
- required correction comments;
- correction-version and media copying;
- resubmission and canonical approval;
- fail-closed `approved_inactive` state;
- normal broker review versus self-approval attribution; and
- lifecycle and append-only audit events.

## Deferred work

- In-app workflow notifications and the reliable outbox foundation are implemented; see [Workflow notifications](./WORKFLOW_NOTIFICATIONS.md). Email delivery workers remain deferred.
- Public listing projection, search indexing, maps, brokerage/agent websites, and activation guards.
- Material changes to already approved listings and before/after comparison.
- Reviewer reminders, service-level reporting, and escalation settings.
- Agent withdrawal and explicit restart after rejection.
