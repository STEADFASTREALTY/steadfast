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
- at least one validated property image; and
- a complete privacy-safe derivative set for every validated image.

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

When an active listing leaves an eligible public lifecycle, its snapshot and public media projection are deleted and its publication record is retained as removed. The dynamic read guard also hides stale projections immediately if the brokerage, representative, or approved version becomes ineligible. The existing agent-departure service therefore removes affected inventory and image access from public search without waiting for a background job.

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

Validated private media is required before activation, but source media is never exposed publicly. After byte-signature and dimension validation, the server decodes each photograph, applies its orientation, discards EXIF/GPS/ICC/XMP metadata, and writes three WebP derivatives:

| Variant | Maximum dimensions | Purpose |
| --- | --- | --- |
| `thumbnail` | 480 × 360 | Small previews |
| `card` | 960 × 720 | Search and website cards |
| `gallery` | 1920 × 1440 | Public listing galleries |

Derivatives are stored in the private `listing-public-derivatives` bucket. The public database projection exposes only opaque derivative IDs, display dimensions, variant, and approved order. It never exposes source filenames, original paths, derivative storage paths, embedded metadata, or service credentials.

Public pages request `/media/listings/{opaqueId}/{variant}.webp`. The server first queries the anonymous RLS-protected projection, then uses its server-only client to retrieve the private derivative. Ineligible, withdrawn, unassigned, or otherwise removed listings return no image. Responses use an exact WebP content type, `nosniff`, a sandbox content policy, and no shared caching so eligibility is rechecked.

New uploads create derivatives before the media record becomes `ready`. Activation also repairs missing derivatives for previously validated images before submitting the transactional publication command. Database activation fails closed unless all three variants exist for every approved image.

## Visitor contact

Active property pages include privacy-preserving contact routing to the currently assigned listing representative. The database revalidates public eligibility and assignment at submission time, stores consent evidence in a private professional record, and emits only privacy-safe notifications. See [Visitor inquiry routing](./VISITOR_INQUIRY_ROUTING.md).

## Deferred controls

- Material changes to active listings and approved unpublication actions.
- Interactive individual markers, clusters, geocoding, and provider licensing.
- Brokerage and agent website publication surfaces.
- Billing-plan and external-feed entitlement checks.
