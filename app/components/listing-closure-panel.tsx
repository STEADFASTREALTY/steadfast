import { requestListingClosureAction } from "@/app/actions/listings";

type ClosureState = "active" | "sold" | "rented";

export function ListingClosurePanel({
  listingId,
  lockVersion,
  requestedState,
}: {
  listingId: string;
  lockVersion: number;
  requestedState: ClosureState;
}) {
  return <section className="listing-closure-panel">
    <div className="listing-closure-copy">
      <span>Listing outcome</span>
      <h2>Keep active or close this listing</h2>
      <p>Sold and Rented are closing requests. The listing changes status only after an authorized brokerage reviewer approves this edited version.</p>
    </div>
    <form
      action={requestListingClosureAction}
      data-prompt-title="Save this listing outcome?"
      data-prompt-message="Sold or Rented will be submitted with this edited version and will require brokerage approval."
      data-prompt-confirm="Save outcome"
    >
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="expectedLockVersion" value={lockVersion} />
      <fieldset>
        <legend>After brokerage approval</legend>
        <label><input type="radio" name="requestedLifecycleState" value="active" defaultChecked={requestedState === "active"} /><span><strong>Keep active</strong><small>Return the approved listing to its current audience.</small></span></label>
        <label><input type="radio" name="requestedLifecycleState" value="sold" defaultChecked={requestedState === "sold"} /><span><strong>Sold</strong><small>Close the property sale and remove it from active publication.</small></span></label>
        <label><input type="radio" name="requestedLifecycleState" value="rented" defaultChecked={requestedState === "rented"} /><span><strong>Rented</strong><small>Close the rental and remove it from active publication.</small></span></label>
      </fieldset>
      <button className="solid-button" type="submit">Save outcome</button>
    </form>
  </section>;
}
