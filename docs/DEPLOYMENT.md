# Deployment reference

This document records non-secret project identifiers and the deployment workflow. Never add passwords, access tokens, private keys, database passwords, or Supabase service-role keys here.

## Vercel

- Team name: `STEADFASTREALTY`
- Team slug: `steadfast-com`
- Project name: `steadfast`
- Project ID: `prj_XXJcEK0YeWbNpmtePSrKfwqxEHwy`
- Team page: `https://vercel.com/steadfast-com`
- Project page: `https://vercel.com/steadfast-com/steadfast`
- Initial domain: `https://steadfast.rockhillinnovation.com`

## Supabase

- Project name: `steadfastrealty`
- Project reference: `wtwvdweaunasdoyuafsb`
- Project URL: `https://wtwvdweaunasdoyuafsb.supabase.co`

The project reference and project URL are public identifiers. API keys must be managed through Vercel environment settings.

## Required Vercel environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-visible | Supabase publishable key; protected by Row Level Security |
| `SUPABASE_SECRET_KEY` | Server-only | Privileged Storage signing and quarantined image validation; never expose to the browser |
| `NEXT_PUBLIC_APP_URL` | Browser-visible | Canonical public application URL |

Server-only keys will be added only when a feature requires them. A Supabase service-role key must never use the `NEXT_PUBLIC_` prefix.

Set browser-visible values for Preview and Production environments. Use separate Supabase projects before production launch so production data is not used in previews.

## Database safety baseline

- Enable Row Level Security on every table exposed through the Data API.
- Add explicit grants and role-specific RLS policies in migrations.
- Do not use user-editable metadata for authorization decisions.
- Keep privileged functions outside exposed schemas and avoid `SECURITY DEFINER` unless reviewed and strictly controlled.
- Run Supabase security and performance advisors before accepting schema migrations.
