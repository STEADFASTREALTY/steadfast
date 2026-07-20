"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Photo = {
  id: string;
  width: number;
  height: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function PublicListingPhotoGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const activePhoto = openIndex === null ? null : photos[openIndex];

  function close() {
    setOpenIndex(null);
    setZoom(MIN_ZOOM);
  }

  function showPhoto(index: number) {
    setOpenIndex(index);
    setZoom(MIN_ZOOM);
  }

  function changePhoto(direction: -1 | 1) {
    if (openIndex === null) return;
    const next = (openIndex + direction + photos.length) % photos.length;
    showPhoto(next);
  }

  useEffect(() => {
    if (openIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") changePhoto(-1);
      if (event.key === "ArrowRight") changePhoto(1);
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(MAX_ZOOM, Number((value + ZOOM_STEP).toFixed(2))));
      if (event.key === "-") setZoom((value) => Math.max(MIN_ZOOM, Number((value - ZOOM_STEP).toFixed(2))));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openIndex]);

  return <>
    <section className="public-media-gallery" aria-label="Property photographs">
      {photos.map((photo, index) => <button className="public-gallery-photo" type="button" key={photo.id} onClick={() => showPhoto(index)} aria-label={`Open photograph ${index + 1} of ${photos.length}`}>
        <Image src={`/media/listings/${photo.id}/gallery.webp`} alt={`${title} photograph ${index + 1}`} width={photo.width} height={photo.height} sizes={index === 0 ? "(max-width: 900px) 100vw, 65vw" : "(max-width: 700px) 100vw, 32vw"} priority={index === 0} unoptimized />
        <span>View photo</span>
      </button>)}
    </section>
    {activePhoto ? <div className="listing-photo-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="listing-photo-viewer" role="dialog" aria-modal="true" aria-label={`Photograph ${openIndex! + 1} of ${photos.length}`}>
        <header>
          <span>Photo {openIndex! + 1} of {photos.length}</span>
          <button type="button" onClick={close} aria-label="Close photo viewer">×</button>
        </header>
        <div className="listing-photo-viewer-image" aria-label="Zoomable property photograph">
          <Image src={`/media/listings/${activePhoto.id}/gallery.webp`} alt={`${title} photograph ${openIndex! + 1}`} width={activePhoto.width} height={activePhoto.height} sizes="100vw" unoptimized style={{ transform: `scale(${zoom})` }} />
        </div>
        <footer>
          <div className="listing-photo-viewer-controls" aria-label="Photo zoom controls">
            <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - ZOOM_STEP).toFixed(2))))} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + ZOOM_STEP).toFixed(2))))} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
          </div>
          {photos.length > 1 ? <div className="listing-photo-viewer-navigation"><button type="button" onClick={() => changePhoto(-1)}>Previous</button><button type="button" onClick={() => changePhoto(1)}>Next</button></div> : null}
        </footer>
      </section>
    </div> : null}
  </>;
}
