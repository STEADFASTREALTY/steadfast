export async function compressListingImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 300 || bitmap.height < 300 || bitmap.width > 12000 || bitmap.height > 12000 || bitmap.width * bitmap.height > 80_000_000) {
      throw new Error("Image dimensions are outside the supported range.");
    }
    // Preserve enough detail for a full-HD listing gallery while avoiding
    // unnecessarily large uploads. Portrait photos use the rotated limit.
    const maxWidth = bitmap.width >= bitmap.height ? 1920 : 1080;
    const maxHeight = bitmap.width >= bitmap.height ? 1080 : 1920;
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image preparation is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("This browser could not prepare the image.");
    const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 180) || "property-image";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
