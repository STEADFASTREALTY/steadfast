"use client";

import { useActionState } from "react";
import { publishIndependentListingAction, type SubmitListingState } from "@/app/actions/listings";

export function IndependentListingPublishPanel({ listingId, listingVersionId, lockVersion, readyImageCount }: { listingId: string; listingVersionId: string; lockVersion: number; readyImageCount: number }) {
  const [state, action, pending] = useActionState<SubmitListingState, FormData>(publishIndependentListingAction, {});
  return <section className="submission-panel independent-publication-panel">
    <div><span>Independent publication</span><h2>Ready to publish?</h2><p>This publishes your exact public draft and its {readyImageCount} validated image{readyImageCount === 1 ? "" : "s"}. No brokerage review is required while you are independent.</p>{state.error ? <p className="inline-form-error" role="alert">{state.error}</p> : null}</div>
    <form action={action} data-prompt-title="Publish this independent listing?" data-prompt-message="The current public details and validated photographs will become searchable on ProperAP." data-prompt-confirm="Publish listing">
      <input type="hidden" name="listingId" value={listingId} /><input type="hidden" name="listingVersionId" value={listingVersionId} /><input type="hidden" name="expectedLockVersion" value={lockVersion} />
      <label><input type="checkbox" required /> <span>I confirm the facts, price, description, location settings, and images are ready for public display.</span></label>
      <button className="solid-button" type="submit" disabled={pending}>{pending ? "Publishing…" : "Publish listing"}</button>
    </form>
  </section>;
}
