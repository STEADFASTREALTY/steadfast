# UI prompts and discovery metadata standards

Status: mandatory for every SteadFast UI change.

## Custom prompt hard rule

SteadFast must never use browser-native `alert()`, `confirm()`, or `prompt()` dialogs. Browser-native prompts are visually inconsistent, difficult to explain clearly, and cannot express SteadFast action severity.

Every confirmation uses `SteadFastPromptProvider`. Forms opt in with bounded `data-prompt-*` attributes:

- `data-prompt-title` — a direct question describing the action;
- `data-prompt-message` — the important consequence in plain language;
- `data-prompt-confirm` — an action-specific label such as “Save changes”;
- `data-prompt-cancel` — optional; defaults to “Cancel”;
- `data-prompt-variant="danger"` — required for delete, removal, rejection, revocation, and other destructive actions.

The submitting button may define these attributes when one form supports different decisions. Button values override form values. Client components that need a confirmation without a form use `useSteadFastPrompt()`.

Required confirmation categories:

- create or invite actions with meaningful external or account effects;
- manual saves and material edits;
- submissions, approvals, publication, and status changes;
- delete, removal, rejection, access revocation, and account departure;
- sign-out and other session-ending actions.

Routine search, field validation, autosave, read-state updates, and ordinary navigation do not require a confirmation. Validation and completion feedback remains inline and uses `role="alert"`, `role="status"`, or `aria-live` as appropriate.

The ESLint configuration rejects native browser prompt APIs. A change that introduces one cannot pass CI.

## Metadata hard rule

Every `app/**/page.tsx` file must export either a static `metadata` object or `generateMetadata()`. `npm run check:metadata` enforces this contract in CI.

Public indexable pages must include:

- a unique, human-readable title and description;
- an absolute canonical URL;
- Open Graph and social-sharing metadata;
- Jamaica-specific language and location context where relevant;
- descriptive headings and escaped visible content;
- structured data when the page represents the organization, website, search collection, professional, brokerage, or property listing;
- inclusion in the sitemap when the route is intended to be discoverable.

Private account, authentication, workspace, operations, and administration pages must have a meaningful title and description plus `noindex`. They must never become indexable merely because the root layout contains public defaults.

“AI SEO ready” means the same factual, machine-readable discipline: stable canonical URLs, server-rendered descriptive copy, semantic HTML, JSON-LD structured data, explicit entities and relationships, current sitemap/robots files, and no hidden keyword stuffing or crawler-specific claims.

Use `publicPageMetadata()` for indexable routes and `privatePageMetadata()` for new private routes. Dynamic public entities use `generateMetadata()` and must fail closed with `noindex` when the record is unavailable.
