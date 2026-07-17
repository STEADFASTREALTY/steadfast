"use client";

import { useActionState } from "react";
import { submitListingForReviewAction, type SubmitListingState } from "@/app/actions/listings";

export function ListingSubmissionPanel({
  listingId,
  listingVersionId,
  lockVersion,
  readyImageCount,
}: {
  listingId: string;
  listingVersionId: string;
  lockVersion: number;
  readyImageCount: number;
}) {
  const [state, action, pending] = useActionState<SubmitListingState, FormData>(submitListingForReviewAction, {});
  return <section className="submission-panel">
    <div><span>Brokerage approval</span><h2>Ready to submit?</h2><p>Submitting freezes this exact version and its {readyImageCount} validated image{readyImageCount === 1 ? "" : "s"}. Your broker or authorized staff can approve it, request corrections, or reject it.</p>{state.error ? <p className="inline-form-error" role="alert">{state.error}</p> : null}</div>
    <form action={action} data-prompt-title="Submit this listing for approval?" data-prompt-message="This exact version, including its price, details, location settings, and photographs, will be frozen for brokerage review." data-prompt-confirm="Submit listing">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="listingVersionId" value={listingVersionId} />
      <input type="hidden" name="expectedLockVersion" value={lockVersion} />
      <label><input type="checkbox" required /> <span>I reviewed the facts, price, description, location settings, and images.</span></label>
      <button className="solid-button" type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit to brokerage"}</button>
    </form>
  </section>;
}
