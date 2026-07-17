# Professional Sites, Sharing, and Recorded Demo Data

## Public websites

SteadFast publishes one active website record per agent or brokerage. Canonical path routes are `/agents/{slug}` and `/brokerages/{slug}`. Verified SteadFast subdomains are mapped to `/sites/{slug}` by the application proxy. Brokerage sites show all active listings owned by the brokerage. Agent sites show listings currently assigned to that agent plus active display shares.

An agent profile stays online when the agent has no active listings. A listing remains owned and editable only by its brokerage and assigned representative.

## Display-only sharing and inquiries

An assigned agent may share an eligible public listing directly with another active SteadFast agent. The receiving agent may display it or remove it from their own site, but cannot edit, submit, approve, reassign, withdraw, or own it. The owner may revoke the share. Each change is audited and notifies the other participant.

On a shared agent website, a visitor may choose the website agent or the listing-owner agent as the primary contact. The inquiry stores the source website, listing owner, displaying agent, and visitor selection. Private visitor contact data is readable only by the selected agent and authorized brokerage oversight roles; the other agent receives a safe notification without the visitor's private content.

## Image controls

Browsers resize selected photographs to a maximum 2,400-pixel edge and re-encode them as WebP before upload, which reduces transfer size and strips normal embedded metadata. The server still validates the uploaded bytes and creates separate re-encoded public derivatives. Original files and derivatives are stored in private buckets. Public delivery uses an application endpoint that rechecks listing eligibility, returns bytes instead of a storage redirect, uses an opaque filename, blocks ordinary cross-site hotlink requests, and sends same-site/no-index response controls.

These controls reduce casual reuse and exposure. They cannot prevent screenshots or a determined recipient from saving pixels already delivered to their browser.

## Demo environment

`scripts/create-demo-environment.mjs` creates the John Stamp and Karen Blake test accounts, the Stamp & Shore Realty demonstration brokerage, dual roles, professional sites, ten clearly labeled Jamaica market simulations, licensed illustrative images, protected derivatives, and one active display share. It reads production credentials from the ignored `.env.production.local` file and prints credentials only to the operator's terminal.

Every created database/auth record is tagged in the service-role-only `demo_data_batches` and `demo_data_records` ledger. The public listing projection includes a demo notice and factual source link. Descriptions are original summaries of public facts. Wikimedia Commons image source and license details are recorded per media item; these images are explicitly illustrative and are not represented as photographs of the corresponding market listing.

Deletion requires an exact batch identifier:

```powershell
node scripts/delete-demo-environment.mjs --confirm=<demo-batch-uuid>
```

The deletion utility removes only IDs recorded in that batch, removes its storage objects and auth users, and then retains the ledger with a `deleted` status for auditability.

## Session behavior

The sign-in checkbox controls whether the Supabase auth cookies persist beyond the current browser session. Refreshes preserve the requested protected route. Account menus provide separate custom-confirmed actions for signing out on this machine, all machines, or other machines.
