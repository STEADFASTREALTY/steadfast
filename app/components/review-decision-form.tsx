"use client";

import { useActionState, useState } from "react";
import { decideListingReviewAction, type ReviewListingState } from "@/app/actions/listings";

export function ReviewDecisionForm({ listingId, listingVersionId }: { listingId: string; listingVersionId: string }) {
  const [decision, setDecision] = useState<"approved" | "changes_requested" | "rejected">("approved");
  const [state, action, pending] = useActionState<ReviewListingState, FormData>(decideListingReviewAction, {});
  const promptTitle = decision === "approved" ? "Approve this listing?" : decision === "changes_requested" ? "Return this listing for changes?" : "Reject this listing?";
  const promptMessage = decision === "approved" ? "This version will become the brokerage-approved record. If it is marked Public, it will be published to the marketplace immediately after approval." : decision === "changes_requested" ? "The submission will be retained and a new working draft will be opened for the agent." : "This proposal will be closed and retained in the brokerage history.";
  return <form action={action} className="review-decision-card" data-prompt-title={promptTitle} data-prompt-message={promptMessage} data-prompt-confirm={decision === "approved" ? "Approve listing" : decision === "changes_requested" ? "Request changes" : "Reject listing"} data-prompt-variant={decision === "rejected" ? "danger" : "standard"}>
    <input type="hidden" name="listingId" value={listingId} />
    <input type="hidden" name="listingVersionId" value={listingVersionId} />
    <div><span>Brokerage decision</span><h2>Review this submission</h2><p>The submitted snapshot cannot be edited. Return it to the agent when corrections are needed.</p></div>
    <fieldset><legend>Decision</legend>
      <label><input type="radio" name="decision" value="approved" checked={decision === "approved"} onChange={() => setDecision("approved")} /><span><strong>Approve</strong><small>Establish this as the canonical version. Public listings publish immediately after their protected eligibility checks pass.</small></span></label>
      <label><input type="radio" name="decision" value="changes_requested" checked={decision === "changes_requested"} onChange={() => setDecision("changes_requested")} /><span><strong>Request changes</strong><small>Retain this submission and create a new editable version for correction.</small></span></label>
      <label><input type="radio" name="decision" value="rejected" checked={decision === "rejected"} onChange={() => setDecision("rejected")} /><span><strong>Reject</strong><small>Close this proposal while retaining its complete history.</small></span></label>
    </fieldset>
    <label className="review-comment"><span>{decision === "rejected" ? "Reason for denial (required)" : `Reviewer comment ${decision === "approved" ? "(optional)" : "(required)"}`}</span><textarea name="comment" rows={5} maxLength={4000} required={decision !== "approved"} placeholder={decision === "approved" ? "Optional approval note" : decision === "rejected" ? "Explain clearly why this listing is being denied." : "Explain exactly what the agent needs to correct."} /></label>
    {decision === "rejected" ? <label className="denial-confirmation"><input name="confirmDenial" type="checkbox" value="yes" required /><span>I confirm this listing is denied and the reason above will be sent to its creator.</span></label> : null}
    {state.error ? <p className="inline-form-error" role="alert">{state.error}</p> : null}
    <button className="solid-button" type="submit" disabled={pending}>{pending ? "Recording decision…" : "Record decision"}</button>
  </form>;
}
