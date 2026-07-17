# Workflow notifications

Status: implemented for listing submission and initial brokerage review.

## What is available

- Each listing submission notifies the brokerage members who are authorized to review it at that moment.
- Approval, correction, and rejection decisions notify the submitting or assigned agent. Approval also informs other relevant reviewers.
- The person who performs an action is excluded from that action's recipient list, including broker-agent self-approval.
- Recipient lists are deduplicated when one person holds multiple roles.
- Signed-in users have a private notification centre at `/account/notifications` and an unread count in the workspace.
- Recipients can mark one notification or all notifications read through a write-only database command.

## Security and privacy rules

- `public.notifications` has row-level security. A person can select only rows addressed to their active account.
- Application users have no direct insert, update, or delete permission on notification records.
- Notification text is generic and privacy-safe. Listing form content and reviewer comments are never copied into notification bodies.
- Opening a notification uses the normal listing page, which rechecks the person's current brokerage and listing authorization. A notification does not grant access.
- Events are created atomically from the immutable audit event written by the listing workflow.

## Reliable delivery foundation

Every in-app notification creates one deduplicated `notification.email.requested` record in `app_private.outbox_events` in the same transaction. The payload contains identifiers only. A future delivery worker will resolve the recipient and approved template at send time, then claim, retry, and complete the private outbox item.

No email is sent in this milestone. An email provider, worker credentials, retry schedule, operational alerts, and unsubscribe classification must be approved before delivery is enabled.

## Verification

The database suite verifies recipient isolation, reviewer selection, deduplication, safe notification text, read commands, outbox privacy, one outbox item per notification, and self-approval behavior.

## Publication dependency

Public marketplace activation and the authorized search projection are now implemented; see [Public listing activation and search](./PUBLIC_LISTING_ACTIVATION_AND_SEARCH.md). Agent and brokerage website surfaces remain deferred.
