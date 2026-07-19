"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  authorizeListingMediaUploadAction,
  finalizeListingMediaUploadAction,
  selectListingCoverMediaAction,
  type SelectListingCoverMediaState,
} from "@/app/actions/listings";
import { MAX_IMAGE_BYTES, MAX_LISTING_IMAGES, MAX_UPLOAD_BATCH } from "@/lib/media/constants";
import { createClient } from "@/lib/supabase/client";
import { compressListingImage } from "@/lib/media/client-image-compression";

type ReadyMedia = {
  id: string;
  url: string;
  width: number;
  height: number;
  originalFilename: string;
};

type UploadState = { kind: "idle" | "uploading" | "error" | "success"; message: string };

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ListingMediaUploader({
  listingId,
  images,
  reservedCount,
  coverMediaId,
}: {
  listingId: string;
  images: ReadyMedia[];
  reservedCount: number;
  coverMediaId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle", message: "No files are being uploaded." });
  const [coverState, coverAction, coverPending] = useActionState<SelectListingCoverMediaState, FormData>(selectListingCoverMediaAction, {});
  const uploading = state.kind === "uploading";
  const selectedCoverId = coverState.coverMediaId ?? coverMediaId ?? images[0]?.id;

  useEffect(() => {
    if (coverState.coverMediaId) {
      router.refresh();
    }
  }, [coverState.coverMediaId, router]);

  async function uploadSelected(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (selected.length > MAX_UPLOAD_BATCH) {
      setState({ kind: "error", message: `Choose no more than ${MAX_UPLOAD_BATCH} images at once.` });
      return;
    }
    if (reservedCount + selected.length > MAX_LISTING_IMAGES) {
      setState({ kind: "error", message: `A listing can contain up to ${MAX_LISTING_IMAGES} images.` });
      return;
    }
    const invalid = selected.find((file) => !ACCEPTED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_IMAGE_BYTES);
    if (invalid) {
      setState({ kind: "error", message: "Choose JPEG, PNG, or WebP images no larger than 15 MB each." });
      return;
    }

    setState({ kind: "uploading", message: `Preparing ${selected.length} private image${selected.length === 1 ? "" : "s"}…` });
    const supabase = createClient();
    let completed = 0;

    for (const sourceFile of selected) {
      setState({ kind: "uploading", message: `Compressing image ${completed + 1} of ${selected.length} before upload…` });
      let file: File;
      try {
        file = await compressListingImage(sourceFile);
      } catch {
        setState({ kind: "error", message: "An image could not be compressed safely. Choose a different JPEG, PNG, or WebP file." });
        break;
      }
      setState({ kind: "uploading", message: `Uploading and checking image ${completed + 1} of ${selected.length}…` });
      const authorization = await authorizeListingMediaUploadAction({
        listingId,
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
      });
      if (authorization.status !== "authorized") {
        setState({ kind: "error", message: authorization.error });
        break;
      }

      const { error: uploadError } = await supabase.storage
        .from("listing-originals")
        .uploadToSignedUrl(authorization.path, authorization.token, file, {
          contentType: file.type,
          cacheControl: "0",
        });
      if (uploadError) {
        setState({ kind: "error", message: "An image did not finish uploading. Please choose it again." });
        break;
      }

      const finalized = await finalizeListingMediaUploadAction(authorization.mediaId);
      if (finalized.status !== "ready") {
        setState({ kind: "error", message: finalized.error });
        break;
      }
      completed += 1;
    }

    if (completed === selected.length) {
      setState({ kind: "success", message: `${completed} image${completed === 1 ? " is" : "s are"} securely attached to this draft.` });
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <section className="listing-media-card" aria-labelledby="listing-images-heading">
      <div className="listing-media-heading">
        <div><span>Private draft media</span><h2 id="listing-images-heading">Property images</h2><p>Images are checked before they can be used. Originals remain private during brokerage review.</p></div>
        <strong>{images.length} / {MAX_LISTING_IMAGES}</strong>
      </div>

      {images.length ? <><p className="listing-cover-help">Choose the photo visitors see first on property cards. You can change it any time before submitting this draft.</p>{coverState.error ? <p className="inline-form-error" role="alert">{coverState.error}</p> : null}<div className="approval-image-previews">{images.map((image, index) => (
        <figure key={image.id}>
          {/* Signed, short-lived private URL generated only after listing authorization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={`Property image ${index + 1}`} width={image.width} height={image.height} />
          <figcaption><span>{image.id === selectedCoverId ? "Cover photo" : `Image ${index + 1}`}</span><small title={image.originalFilename}>{image.width} × {image.height}</small></figcaption>
          <form action={coverAction} data-prompt-title="Make this the cover photo?" data-prompt-message="This image will appear first on property cards and public listings after brokerage approval." data-prompt-confirm="Set cover photo">
            <input type="hidden" name="listingId" value={listingId} />
            <input type="hidden" name="mediaId" value={image.id} />
            <button className={image.id === selectedCoverId ? "cover-photo-button active" : "cover-photo-button"} type="submit" disabled={coverPending || image.id === selectedCoverId}>{coverPending && image.id !== selectedCoverId ? "Saving…" : image.id === selectedCoverId ? "Main card photo" : "Set as main card photo"}</button>
          </form>
        </figure>
      ))}</div></> : <div className="listing-media-empty"><strong>No property images yet</strong><p>Add bright, accurate photographs. Avoid people, identity documents, vehicle plates, or other unnecessary personal information.</p></div>}

      <div className={`listing-media-upload upload-${state.kind}`}>
        <label className="solid-button" aria-disabled={uploading || reservedCount >= MAX_LISTING_IMAGES}>
          {uploading ? "Checking images…" : "Choose property images"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading || reservedCount >= MAX_LISTING_IMAGES}
            onChange={(event) => void uploadSelected(event.target.files)}
          />
        </label>
        <div><strong>JPEG, PNG, or WebP</strong><p>Up to 15 MB each · 30 at a time · compressed to full-HD before upload</p></div>
        <p className="listing-media-status" role={state.kind === "error" ? "alert" : "status"}>{state.message}</p>
      </div>
    </section>
  );
}
