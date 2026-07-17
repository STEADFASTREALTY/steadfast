# Public listing activation and search

Status: implemented for the SteadFast marketplace foundation.

## Publication workflow

An approved listing remains `approved_inactive` until an authorized brokerage reviewer explicitly confirms activation. The database then rechecks, in one transaction:

- current approved version and optimistic lock;
- approved revision state, content hash, and `public` visibility;
- active brokerage;
- active assigned representative with an active agent role and account;
- property duplicate-review clearance;
- approved public location rule; and
- at least one validated property image.

If every guard passes, the listing becomes `active`, receives a marketplace publication record, produces a sanitized public snapshot, and appends lifecycle and audit events. Any failed guard rolls back the complete activation.

## Anonymous projection

`public.public_listing_snapshots` is the only listing source exposed to visitors. It contains approved public copy, searchable facts, parish, approved display location, brokerage identity, assigned-agent identity, and a validated-media count.

It intentionally excludes:

- raw street-address records;
- drafts and rejected or returned versions;
- review comments;
- audit history;
- internal notes;
- private storage object paths; and
- unapproved or guessed coordinates.

Row-level security allows read-only access to `anon` and `authenticated`. A private security-definer eligibility check revalidates the listing, brokerage, approved version, assignment, agent membership, agent role, and account on every public read. Direct public writes are denied.

## Automatic removal

When an active listing leaves an eligible public lifecycle, its snapshot is deleted and its publication record is retained as removed. The dynamic read guard also hides stale projections immediately if the brokerage, representative, or approved version becomes ineligible. The existing agent-departure service therefore removes affected inventory from public search without waiting for a background job.

## Search and area view

The public `/properties` page supports:

- sale and long-term-rental inventory;
- location full-text search;
- major property-type filters;
- approved price and core facts;
- brokerage and assigned-agent attribution; and
- zoomed-out parish grouping.

Each listing has a canonical public detail route at `/properties/{listingId}`. React renders all listing content as escaped text.

The projection stores approved latitude and longitude only when an approved public point exists. Missing coordinates are never guessed. A licensed geocoding provider and interactive map renderer remain separate integrations.

## Public media boundary

Validated private media is required before activation, but source media is not exposed publicly. Public-safe derivatives must strip metadata, use governed formats and dimensions, and be delivered without revealing private source paths. Until that derivative pipeline is enabled, public pages show the validated image count without serving source files.

## Deferred controls

- Public-safe image derivative generation and delivery.
- Secure visitor inquiry with selected-agent contact routing.
- Material changes to active listings and approved unpublication actions.
- Interactive individual markers, clusters, geocoding, and provider licensing.
- Brokerage and agent website publication surfaces.
- Billing-plan and external-feed entitlement checks.
