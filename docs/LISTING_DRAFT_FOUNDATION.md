# Listing Draft Foundation

This document describes the first implemented M2 listing workflow slice. It creates a complete private brokerage-owned draft through a guided workspace form and a single transactional database command.

## User routes

- `/workspace/listings` shows the listing records the signed-in professional is authorized to read.
- `/workspace/listings/new` provides the guided create-listing form.
- `/workspace/listings/[listingId]` reopens an authorized working draft for recoverable editing.
- Both routes require an active brokerage membership. Creation additionally requires an active agent or broker role.

The form supports sale and long-term rental listings for residential, commercial, land, and development properties. Currency is fixed to JMD for the initial Jamaica release. Public, professional-network, and private visibility are requests only; a new listing always remains private and in Draft state.

## Transaction boundary

The browser cannot insert directly into addresses, properties, listings, assignments, versions, state history, or audit records. It may insert only into `create_listing_draft_commands`, a Row Level Security protected write-only command table.

The `app_private.process_create_listing_draft_command()` trigger rechecks the authenticated identity, active membership, professional role, brokerage permission, and Jamaican parish. One transaction then:

1. normalizes the exact address and creates a SHA-256 property fingerprint;
2. reuses a matching brokerage property or creates its private address and property records;
3. creates the brokerage-owned listing in Draft state;
4. assigns the creator as its active representative;
5. creates version 1 as an editable working draft;
6. records the initial lifecycle event; and
7. appends a privacy-safe audit summary.

The command trigger returns `null`, so command payloads are never stored. Exact addresses and listing content are excluded from the audit summary.

## Editing and autosave

The browser submits edits only through `update_listing_draft_commands`. The private trigger locks the target listing, rechecks active brokerage access and record state, and compares the caller's `expected_lock_version` with the current listing lock. A stale tab receives SQLSTATE `40001`; its data cannot overwrite a newer save.

Valid forms autosave to Supabase after a short pause. Private form content is not copied into browser storage. The page warns before navigation while a save is outstanding, shows saved, incomplete, error, and conflict states in plain language, and offers an explicit reload path after a conflict.

Identical autosaves are idempotent and do not advance the lock. A material save updates the working version and increments the listing lock atomically. Manual material saves append only a safe changed-field summary to the audit log; autosaves do not create noisy audit events. Submitted versions and non-Draft listings cannot pass this command.

An address or property-type edit never mutates the retained property behind another listing. The transaction selects an existing matching brokerage property or creates a new private property candidate and repoints only the working listing.

## Validation and usability

Zod validates all Server Action input at runtime before it reaches Supabase. PostgreSQL repeats critical bounds and state checks. Validation failures remain on the form and use safe user-facing text; raw database errors are not returned to the browser.

The address fingerprint is scoped to the brokerage and property type. An advisory transaction lock prevents concurrent duplicate creation for the same fingerprint. A matching property can support separate brokerage offers, such as historical sale and rental listings, without duplicating its private address.

## Authorization

- Visitors and ordinary consumers cannot create drafts.
- Broker staff without an agent role cannot create drafts.
- Active agents and principal brokers may create and represent their own drafts.
- Departed professionals immediately lose creation access.
- Raw listing-domain writes remain unavailable to browser roles.
- Existing listing RLS continues to control every read after creation.

## Verification

Run `npm run db:verify` and `npm run ci`. The database suite includes creation, role denial, departure denial, normalized address, property reuse, assignment, version, lifecycle, audit, and write-only command tests.

## Next implementation slice

Add private media upload authorization and image validation, followed by draft completeness checks and brokerage submission. Public projection and approval remain separate controlled milestones.
