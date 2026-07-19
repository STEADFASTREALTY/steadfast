"use client";

import { useRef, useState } from "react";
import { saveListingDraftAction } from "@/app/actions/listings";

type Parish = { id: string; name: string };
export type EditableListingDraft = {
  listingId: string;
  lockVersion: number;
  administrativeAreaId: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  purpose: "sale" | "long_term_rent";
  propertyType: "residential" | "commercial" | "land" | "development";
  propertySubtype: string;
  price: string;
  pricePeriod: "" | "month" | "year";
  title: string;
  description: string;
  bedrooms: string;
  bathrooms: string;
  buildingArea: string;
  landArea: string;
  areaUnit: "" | "sq_ft" | "sq_m" | "acre" | "hectare";
  visibility: "private" | "professional_network" | "public";
  publicLocationPrecision: "exact" | "street" | "area" | "hidden";
};

type SaveState = { kind: "saved" | "unsaved" | "saving" | "incomplete" | "error" | "conflict"; message: string };

export function EditListingForm({ initial, parishes }: { initial: EditableListingDraft; parishes: Parish[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockVersionRef = useRef(initial.lockVersion);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [propertyType, setPropertyType] = useState(initial.propertyType);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "saved", message: "All changes are saved securely." });
  const showRooms = propertyType === "residential" || propertyType === "development";

  function clearSaveTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function scheduleAutosave() {
    if (conflictRef.current) return;
    dirtyRef.current = true;
    setSaveState({ kind: "unsaved", message: "Unsaved changes — autosave will begin shortly." });
    clearSaveTimer();
    timerRef.current = setTimeout(() => void saveDraft("autosave"), 1600);
  }

  async function saveDraft(mode: "autosave" | "manual") {
    const form = formRef.current;
    if (!form || conflictRef.current) return;
    clearSaveTimer();

    if (!form.checkValidity()) {
      if (mode === "manual") form.reportValidity();
      setSaveState({ kind: "incomplete", message: "Complete the highlighted required fields to resume autosave." });
      return;
    }
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }

    savingRef.current = true;
    dirtyRef.current = false;
    setSaving(true);
    setSaveState({ kind: "saving", message: mode === "manual" ? "Saving your draft…" : "Autosaving…" });

    const formData = new FormData(form);
    formData.set("listingId", initial.listingId);
    formData.set("expectedLockVersion", String(lockVersionRef.current));
    formData.set("saveMode", mode);
    const result = await saveListingDraftAction(formData);

    if (result.status === "conflict") {
      conflictRef.current = true;
      setSaveState({ kind: "conflict", message: result.error });
    } else if (result.status === "error") {
      dirtyRef.current = true;
      setSaveState({ kind: "error", message: result.error });
    } else {
      lockVersionRef.current = result.lockVersion;
      const time = new Date(result.savedAt).toLocaleTimeString("en-JM", { hour: "numeric", minute: "2-digit" });
      setSaveState({ kind: "saved", message: `Saved securely at ${time}.` });
    }

    savingRef.current = false;
    setSaving(false);
    if (dirtyRef.current && !conflictRef.current && result.status === "saved") scheduleAutosave();
  }

  return (
    <form ref={formRef} className="listing-wizard" data-prompt-title="Save these listing changes?" data-prompt-message="Your current edits will replace the working draft. The saved history and brokerage approval rules remain unchanged." data-prompt-confirm="Save changes" onChange={scheduleAutosave} onSubmit={(event) => { event.preventDefault(); dirtyRef.current = true; void saveDraft("manual"); }}>
      <section className="wizard-section">
        <div className="wizard-step"><span>01</span><div><strong>Offer and property</strong><p>Changes save after you pause typing.</p></div></div>
        <div className="wizard-fields two">
          <label><span>Listing purpose</span><select name="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value as EditableListingDraft["purpose"])}><option value="sale">For sale</option><option value="long_term_rent">Long-term rental</option></select></label>
          <label><span>Property type</span><select name="propertyType" value={propertyType} onChange={(event) => setPropertyType(event.target.value as EditableListingDraft["propertyType"])}><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="land">Land</option><option value="development">Development</option></select></label>
          <label><span>Property style or subtype</span><input name="propertySubtype" maxLength={80} defaultValue={initial.propertySubtype} /></label>
          <label><span>{purpose === "sale" ? "Asking price (JMD)" : "Rent (JMD)"}</span><input name="price" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" required defaultValue={initial.price} /></label>
          {purpose === "long_term_rent" ? <label><span>Rent period</span><select name="pricePeriod" required defaultValue={initial.pricePeriod || "month"}><option value="month">Per month</option><option value="year">Per year</option></select></label> : <input type="hidden" name="pricePeriod" value="" />}
        </div>
      </section>

      <section className="wizard-section">
        <div className="wizard-step"><span>02</span><div><strong>Private property location</strong><p>Changing the address creates a new retained property candidate; it never silently alters another listing.</p></div></div>
        <div className="wizard-fields two">
          <label className="full"><span>Street address</span><input name="addressLine1" minLength={2} maxLength={200} required autoComplete="street-address" defaultValue={initial.addressLine1} /></label>
          <label><span>Unit, apartment, or building</span><input name="addressLine2" maxLength={200} defaultValue={initial.addressLine2} /></label>
          <label><span>Parish</span><select name="administrativeAreaId" required defaultValue={initial.administrativeAreaId}>{parishes.map((parish) => <option key={parish.id} value={parish.id}>{parish.name}</option>)}</select></label>
          <label><span>Postal code</span><input name="postalCode" maxLength={20} defaultValue={initial.postalCode} /></label>
          <label><span>Public location</span><select name="publicLocationPrecision" defaultValue={initial.publicLocationPrecision}><option value="area">Show parish or area only</option><option value="street">Show street and parish</option><option value="exact">Show exact approved address</option><option value="hidden">Hide the location</option></select></label>
        </div>
      </section>

      <section className="wizard-section">
        <div className="wizard-step"><span>03</span><div><strong>Buyer-facing details</strong><p>Keep the description accurate and free of unnecessary personal information.</p></div></div>
        <div className="wizard-fields two">
          <label className="full"><span>Listing title</span><input name="title" minLength={5} maxLength={160} required defaultValue={initial.title} /></label>
          <label className="full"><span>Description</span><textarea name="description" minLength={20} maxLength={10000} required rows={7} defaultValue={initial.description} /></label>
          {showRooms ? <><label><span>Bedrooms</span><input name="bedrooms" type="number" min="0" max="100" step="1" defaultValue={initial.bedrooms} /></label><label><span>Bathrooms</span><input name="bathrooms" type="number" min="0" max="100" step="0.5" defaultValue={initial.bathrooms} /></label></> : <><input type="hidden" name="bedrooms" value="" /><input type="hidden" name="bathrooms" value="" /></>}
          <label><span>Building area</span><input name="buildingArea" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" defaultValue={initial.buildingArea} /></label>
          <label><span>Land area</span><input name="landArea" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" defaultValue={initial.landArea} /></label>
          <label><span>Area unit</span><select name="areaUnit" defaultValue={initial.areaUnit}><option value="">Choose if area is entered</option><option value="sq_ft">Square feet</option><option value="sq_m">Square metres</option><option value="acre">Acres</option><option value="hectare">Hectares</option></select></label>
        </div>
      </section>

      <section className="wizard-section">
        <div className="wizard-step"><span>04</span><div><strong>Intended audience</strong><p>The listing remains private until the brokerage approves it.</p></div></div>
        <fieldset className="visibility-options"><legend>Requested visibility</legend>
          <label><input type="radio" name="visibility" value="public" defaultChecked={initial.visibility === "public"} /><span><strong>Public</strong><small>Publishes to public search and websites immediately after broker approval.</small></span></label>
          <label><input type="radio" name="visibility" value="professional_network" defaultChecked={initial.visibility === "professional_network"} /><span><strong>Agents only</strong><small>Visible to all approved agents on CanadaSAP after approval. It will not appear in public search or public websites.</small></span></label>
          <label><input type="radio" name="visibility" value="private" defaultChecked={initial.visibility === "private"} /><span><strong>Private</strong><small>Keep it inside the brokerage workspace.</small></span></label>
        </fieldset>
      </section>

      <div className={`wizard-submit save-${saveState.kind}`}><div><strong>Private working draft</strong><p aria-live="polite">{saveState.message}</p>{saveState.kind === "conflict" ? <a className="reload-draft-link" href={`/workspace/listings/${initial.listingId}`}>Reload the latest saved draft</a> : null}</div><button className="solid-button" type="submit" disabled={saving || saveState.kind === "conflict"}>{saving ? "Saving…" : "Save now"}</button></div>
    </form>
  );
}
