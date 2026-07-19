"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  authorizeListingMediaUploadAction,
  createListingDraftAction,
  finalizeListingMediaUploadAction,
  type CreateListingDraftState,
} from "@/app/actions/listings";
import { MAX_IMAGE_BYTES, MAX_LISTING_IMAGES } from "@/lib/media/constants";
import { compressListingImage } from "@/lib/media/client-image-compression";
import { createClient } from "@/lib/supabase/client";

type Parish = { id: string; name: string };
type UploadState = { kind: "idle" | "uploading" | "error"; message: string };

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function CreateListingForm({ parishes, returnTo }: { parishes: Parish[]; returnTo?: string }) {
  const router = useRouter();
  const uploadStartedFor = useRef<string | null>(null);
  const selectedImageFilesRef = useRef<File[]>([]);
  const uploadedImageIndexesRef = useRef<Set<number>>(new Set());
  const [purpose, setPurpose] = useState("sale");
  const [propertyType, setPropertyType] = useState("residential");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [retryUpload, setRetryUpload] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle", message: "No images selected yet." });
  const [state, formAction, pending] = useActionState<CreateListingDraftState, FormData>(createListingDraftAction, {});
  const showRooms = propertyType === "residential" || propertyType === "development";
  const uploading = uploadState.kind === "uploading";

  function chooseImages(files: FileList | null) {
    const images = Array.from(files ?? []);
    if (!images.length) return;
    if (images.length > MAX_LISTING_IMAGES) {
      selectedImageFilesRef.current = [];
      uploadedImageIndexesRef.current = new Set();
      setSelectedImages([]);
      setUploadState({ kind: "error", message: `Choose up to ${MAX_LISTING_IMAGES} images for one listing.` });
      return;
    }
    if (images.some((file) => !ACCEPTED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_IMAGE_BYTES)) {
      selectedImageFilesRef.current = [];
      uploadedImageIndexesRef.current = new Set();
      setSelectedImages([]);
      setUploadState({ kind: "error", message: "Choose JPEG, PNG, or WebP images no larger than 15 MB each." });
      return;
    }
    selectedImageFilesRef.current = images;
    uploadedImageIndexesRef.current = new Set();
    setSelectedImages(images);
    setUploadState({ kind: "idle", message: `${images.length} image${images.length === 1 ? "" : "s"} ready. They will be compressed to full-HD before upload.` });
  }

  useEffect(() => {
    const urls = selectedImages.map((image) => URL.createObjectURL(image));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [selectedImages]);

  useEffect(() => {
    if (!state.listingId) return;
    if (uploadStartedFor.current === state.listingId && retryUpload === 0) return;
    uploadStartedFor.current = state.listingId;

    const destination = `/workspace/listings/${state.listingId}`;
    const filesToUpload = selectedImageFilesRef.current;
    if (!filesToUpload.length) {
      router.push(`${destination}?notice=Private+draft+created.`);
      return;
    }

    void (async () => {
      const supabase = createClient();
      const remaining = filesToUpload
        .map((sourceFile, index) => ({ sourceFile, index }))
        .filter(({ index }) => !uploadedImageIndexesRef.current.has(index));
      for (let position = 0; position < remaining.length; position += 1) {
        const { sourceFile, index } = remaining[position];
        const completed = uploadedImageIndexesRef.current.size;
        setUploadState({ kind: "uploading", message: `Compressing image ${completed + 1} of ${filesToUpload.length} to full-HD…` });
        let image: File;
        try {
          image = await compressListingImage(sourceFile);
        } catch {
          setUploadState({ kind: "error", message: "One image could not be compressed. It has not been lost; choose a different image or retry the upload." });
          return;
        }
        setUploadState({ kind: "uploading", message: `Securely uploading image ${completed + 1} of ${filesToUpload.length}…` });
        const authorization = await authorizeListingMediaUploadAction({ listingId: state.listingId, filename: image.name, mimeType: image.type, byteSize: image.size });
        if (authorization.status !== "authorized") {
          setUploadState({ kind: "error", message: `${authorization.error} Your other selected images remain queued.` });
          return;
        }
        const { error } = await supabase.storage.from("listing-originals").uploadToSignedUrl(authorization.path, authorization.token, image, { contentType: image.type, cacheControl: "0" });
        if (error) {
          setUploadState({ kind: "error", message: "One image did not finish uploading. Your other selected images remain queued; retry to continue." });
          return;
        }
        const finalized = await finalizeListingMediaUploadAction(authorization.mediaId);
        if (finalized.status !== "ready") {
          setUploadState({ kind: "error", message: `${finalized.error} Your other selected images remain queued.` });
          return;
        }
        uploadedImageIndexesRef.current.add(index);
      }
      selectedImageFilesRef.current = [];
      uploadedImageIndexesRef.current = new Set();
      const completed = filesToUpload.length;
      router.push(`${destination}?notice=${encodeURIComponent(`Private draft created with ${completed} validated image${completed === 1 ? "" : "s"}.`)}`);
    })();
  }, [retryUpload, router, state.listingId, state.returnTo]);

  return (
    <form action={formAction} className="listing-wizard" data-prompt-title="Create this private draft?" data-prompt-message="SteadFast will save the draft, compress selected property photos to full-HD, strip metadata, and securely upload them for brokerage review." data-prompt-confirm="Create draft">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <section className="wizard-section">
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
        <div className="wizard-step"><span>04</span><div><strong>Add property photos.</strong><p>Choose up to 30 still images. They are compressed before the secure upload begins.</p></div></div>
        <div className={`listing-media-card create-listing-media-card upload-${uploadState.kind}`}>
          <div className="listing-media-heading"><div><span>Property images</span><h2>Ready for review</h2><p>JPEG, PNG, or WebP only. Each source file can be up to 15 MB and is converted to a full-HD WebP image before upload.</p></div><strong>{selectedImages.length} / {MAX_LISTING_IMAGES}</strong></div>
          <div className="listing-media-upload">
            <label className="solid-button" aria-disabled={pending || uploading}>
              {uploading ? "Preparing images…" : "Choose property images"}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={pending || uploading} onChange={(event) => chooseImages(event.target.files)} />
            </label>
            <div><strong>Up to 30 images</strong><p>Landscape photos are capped at 1920 × 1080. Portrait photos use the equivalent rotated limit.</p></div>
            <p className="listing-media-status" role={uploadState.kind === "error" ? "alert" : "status"}>{uploadState.message}</p>
          </div>
          {previewUrls.length ? <div className="create-listing-image-previews" aria-label="Selected property image previews">{previewUrls.map((url, index) => <figure key={url}><img src={url} alt={`Selected property image ${index + 1}`} /><figcaption>Image {index + 1}</figcaption></figure>)}</div> : null}
        </div>
      </section>

      <section className="wizard-section">
        <div className="wizard-step"><span>05</span><div><strong>Choose the intended audience.</strong><p>This is only a request. The draft cannot appear publicly before brokerage approval.</p></div></div>
        <fieldset className="visibility-options"><legend>Requested visibility</legend>
          <label><input type="radio" name="visibility" value="public" defaultChecked /><span><strong>Public</strong><small>Eligible for public search and websites after approval.</small></span></label>
          <label><input type="radio" name="visibility" value="professional_network" /><span><strong>Agents only</strong><small>Visible to all approved agents on CanadaSAP after approval. It will not appear in public search or public websites.</small></span></label>
          <label><input type="radio" name="visibility" value="private" /><span><strong>Private</strong><small>Keep it inside your brokerage workspace.</small></span></label>
        </fieldset>
      </section>

      <div className="wizard-submit"><div><strong>{state.listingId ? "Private draft created" : "Saved as a private draft"}</strong><p>{state.listingId && uploadState.kind === "error" ? "The draft and every completed image are saved. Retry to continue the remaining image uploads." : selectedImages.length ? "Selected images will be compressed and securely attached before the draft opens." : "You will review and submit it to your broker in a later step."}</p>{state.error ? <p className="inline-form-error" role="alert">{state.error}</p> : null}</div>{state.listingId && uploadState.kind === "error" ? <button className="solid-button" type="button" onClick={() => setRetryUpload((value) => value + 1)}>Retry image upload</button> : <button className="solid-button" type="submit" disabled={pending || uploading || Boolean(state.listingId)}>{pending ? "Creating draft…" : uploading ? "Uploading images…" : selectedImages.length ? "Create draft and upload images" : "Create private draft"}</button>}</div>
    </form>
  );
}
