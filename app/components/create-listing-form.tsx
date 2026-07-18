"use client";

import { useActionState, useState } from "react";
import { createListingDraftAction, type CreateListingDraftState } from "@/app/actions/listings";

type Parish = { id: string; name: string };

export function CreateListingForm({ parishes, returnTo }: { parishes: Parish[]; returnTo?: string }) {
  const [purpose, setPurpose] = useState("sale");
  const [propertyType, setPropertyType] = useState("residential");
  const [state, formAction, pending] = useActionState<CreateListingDraftState, FormData>(createListingDraftAction, {});
  const showRooms = propertyType === "residential" || propertyType === "development";

  return (
    <form action={formAction} className="listing-wizard" data-prompt-title="Create this private draft?" data-prompt-message="SteadFast will save these details inside your brokerage workspace. You can continue editing before submitting it for approval." data-prompt-confirm="Create draft">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}<section className="wizard-section">
        <div className="wizard-step"><span>01</span><div><strong>What are you marketing?</strong><p>Start with the offer and property type.</p></div></div>
        <div className="wizard-fields two">
          <label><span>Listing purpose</span><select name="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)}><option value="sale">For sale</option><option value="long_term_rent">Long-term rental</option></select></label>
          <label><span>Property type</span><select name="propertyType" value={propertyType} onChange={(event) => setPropertyType(event.target.value)}><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="land">Land</option><option value="development">Development</option></select></label>
          <label><span>Property style or subtype</span><input name="propertySubtype" maxLength={80} placeholder={propertyType === "land" ? "Residential lot, farm land…" : "Apartment, townhouse, office…"} /></label>
          <label><span>{purpose === "sale" ? "Asking price (JMD)" : "Rent (JMD)"}</span><input name="price" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" required placeholder="42500000" /></label>
          {purpose === "long_term_rent" ? <label><span>Rent period</span><select name="pricePeriod" required defaultValue="month"><option value="month">Per month</option><option value="year">Per year</option></select></label> : <input type="hidden" name="pricePeriod" value="" />}
        </div>
      </section>

      <section className="wizard-section">
        <div className="wizard-step"><span>02</span><div><strong>Where is the property?</strong><p>The exact address remains private until the brokerage approves the listing.</p></div></div>
        <div className="wizard-fields two">
          <label className="full"><span>Street address</span><input name="addressLine1" minLength={2} maxLength={200} required autoComplete="street-address" placeholder="20 Ocean View Drive" /></label>
          <label><span>Unit, apartment, or building</span><input name="addressLine2" maxLength={200} placeholder="Apartment 4" /></label>
          <label><span>Parish</span><select name="administrativeAreaId" required defaultValue=""><option value="" disabled>Choose a parish</option>{parishes.map((parish) => <option key={parish.id} value={parish.id}>{parish.name}</option>)}</select></label>
          <label><span>Postal code</span><input name="postalCode" maxLength={20} placeholder="Optional" /></label>
          <label><span>Public location</span><select name="publicLocationPrecision" defaultValue="area"><option value="area">Show parish or area only</option><option value="street">Show street and parish</option><option value="exact">Show exact approved address</option><option value="hidden">Hide the location</option></select></label>
        </div>
      </section>

      <section className="wizard-section">
        <div className="wizard-step"><span>03</span><div><strong>Describe it clearly.</strong><p>Use plain facts buyers and renters can understand quickly.</p></div></div>
        <div className="wizard-fields two">
          <label className="full"><span>Listing title</span><input name="title" minLength={5} maxLength={160} required placeholder="Ocean-view apartment in Montego Bay" /></label>
          <label className="full"><span>Description</span><textarea name="description" minLength={20} maxLength={10000} required rows={7} placeholder="Describe the property, its condition, setting, and important features. Do not include private personal information." /></label>
          {showRooms ? <><label><span>Bedrooms</span><input name="bedrooms" type="number" min="0" max="100" step="1" placeholder="2" /></label><label><span>Bathrooms</span><input name="bathrooms" type="number" min="0" max="100" step="0.5" placeholder="2.5" /></label></> : <><input type="hidden" name="bedrooms" value="" /><input type="hidden" name="bathrooms" value="" /></>}
          <label><span>Building area</span><input name="buildingArea" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" placeholder="1450" /></label>
          <label><span>Land area</span><input name="landArea" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" placeholder="0.25" /></label>
          <label><span>Area unit</span><select name="areaUnit" defaultValue=""><option value="">Choose if area is entered</option><option value="sq_ft">Square feet</option><option value="sq_m">Square metres</option><option value="acre">Acres</option><option value="hectare">Hectares</option></select></label>
        </div>
      </section>

      <section className="wizard-section">
        <div className="wizard-step"><span>04</span><div><strong>Choose the intended audience.</strong><p>This is only a request. The draft cannot appear publicly before brokerage approval.</p></div></div>
        <fieldset className="visibility-options"><legend>Requested visibility</legend>
          <label><input type="radio" name="visibility" value="public" defaultChecked /><span><strong>Public</strong><small>Eligible for public search and websites after approval.</small></span></label>
          <label><input type="radio" name="visibility" value="professional_network" /><span><strong>Agents only</strong><small>Visible to all approved agents on CanadaSAP after approval. It will not appear in public search or public websites.</small></span></label>
          <label><input type="radio" name="visibility" value="private" /><span><strong>Private</strong><small>Keep it inside your brokerage workspace.</small></span></label>
        </fieldset>
      </section>

      <div className="wizard-submit"><div><strong>Saved as a private draft</strong><p>You will review and submit it to your broker in a later step.</p>{state.error ? <p className="inline-form-error" role="alert">{state.error}</p> : null}</div><button className="solid-button" type="submit" disabled={pending}>{pending ? "Creating draft…" : "Create private draft"}</button></div>
    </form>
  );
}
