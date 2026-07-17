# Listing Media Pipeline

Status: implemented foundation  
Last updated: 2026-07-16

## Purpose

SteadFast agents and authorized brokerage managers can attach property photographs to an unsubmitted listing draft. A selected file is not trusted because its name or browser-provided content type says it is an image. Every original remains private and quarantined until the server checks its actual bytes.

## User experience

- The listing draft accepts JPEG, PNG, and WebP still images.
- An agent can choose up to 10 files at once.
- Each file can be up to 15 MB.
- A listing can reserve up to 30 active images.
- Validated images appear in the private draft gallery.
- Invalid, animated, mismatched, corrupt, oversized, undersized, or decompression-risk images are rejected with a safe user-facing explanation.
- Exact storage paths, internal errors, keys, and raw database errors are never shown to the user.

## Security design

1. The browser sends only bounded file metadata to a Server Action.
2. The authenticated Supabase session inserts a write-only authorization command.
3. The database verifies active brokerage membership, listing ownership or `listing.manage` permission, an editable working draft, the 30-image limit, and the exact random path convention.
4. The server uses `SUPABASE_SECRET_KEY` to create a short-lived signed upload token. The key is server-only and must never use a `NEXT_PUBLIC_` name.
5. The browser uploads directly to the private `listing-originals` bucket using that token. Upsert is disabled.
6. A second Server Action confirms that the caller can still read the listing media, claims the record for validation, and downloads the object through the server-only client.
7. The validator checks byte size, file signature, declared-versus-detected type, animation markers, dimensions, and total pixels.
8. Valid media becomes `ready`. Rejected objects are removed through the Storage API and retain only bounded rejection metadata.
9. Private workspace previews use 15-minute signed read URLs created only after normal listing RLS has authorized the page request.

The browser has no insert, update, or delete privilege on `listing_media` or `listing_version_media`. It cannot mark an object ready. Authenticated users also have no general `storage.objects` upload policy for the originals bucket; uploads require the server-issued signed token.

## Data model

- `listing_media` stores tenant ownership, random object path, bounded private filename metadata, declared and detected properties, validation status, dimensions, and lifecycle timestamps.
- `listing_version_media` fixes an ordered set of media to a specific listing version. This supports immutable approval snapshots.
- `authorize_listing_media_upload_commands` is a write-only command boundary. Its trigger performs authorization and stores no command row.
- `listing-originals` is a private bucket restricted to JPEG, PNG, WebP, and 15 MB per object.

## Limits and validation

| Control | Rule |
|---|---|
| Batch | 10 images |
| Listing | 30 active images |
| File size | 1 byte to 15 MB |
| Dimensions | 300 to 12,000 pixels per side |
| Pixel count | Maximum 80 million |
| Formats | Still JPEG, PNG, WebP |
| Upload authorization | 10 minutes |
| Private preview URL | 15 minutes |

SVG, GIF, animated PNG, animated WebP, and all other formats are rejected. Public delivery will later use metadata-stripped, server-generated derivatives; quarantined originals must not be used as permanent public assets.

## Operations

- Required Vercel variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY`.
- The health endpoint reports only whether media validation is configured; it never returns key values.
- Expired pending authorizations are retired when the next upload is authorized for that listing.
- Storage deletion must use the Supabase Storage API. Never delete rows directly from `storage.objects`.
- Database RLS tests cover tenant isolation, departed users, immutable submitted versions, arbitrary paths, direct-write denial, and private bucket controls.
- Application tests cover supported signatures, MIME spoofing, animated PNGs, corrupt bytes, size mismatch, unsafe dimensions, and excess pixel counts.
