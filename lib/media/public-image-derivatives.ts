import sharp from "sharp";

export const PUBLIC_IMAGE_VARIANTS = [
  { name: "thumbnail", width: 480, height: 360, quality: 76 },
  { name: "card", width: 960, height: 720, quality: 80 },
  { name: "gallery", width: 1920, height: 1440, quality: 84 },
] as const;

export type PublicImageVariant = (typeof PUBLIC_IMAGE_VARIANTS)[number]["name"];

export type GeneratedImageDerivative = {
  variant: PublicImageVariant;
  bytes: Buffer;
  width: number;
  height: number;
};

export async function createPublicImageDerivatives(
  source: Uint8Array,
): Promise<GeneratedImageDerivative[]> {
  return Promise.all(PUBLIC_IMAGE_VARIANTS.map(async (variant) => {
    // Sharp strips EXIF, GPS, ICC, XMP and other source metadata unless
    // metadata retention is explicitly requested. rotate() applies EXIF
    // orientation to pixels before that metadata is discarded.
    const bytes = await sharp(source, {
      animated: false,
      failOn: "error",
      limitInputPixels: 80_000_000,
    })
      .rotate()
      .resize({
        width: variant.width,
        height: variant.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ effort: 4, quality: variant.quality, smartSubsample: true })
      .toBuffer();
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== "webp") {
      throw new Error("The public image derivative could not be verified.");
    }
    return { variant: variant.name, bytes, width: metadata.width, height: metadata.height };
  }));
}
