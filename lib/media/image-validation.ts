import { MAX_IMAGE_BYTES } from "./constants";
export { LISTING_MEDIA_BUCKET, MAX_IMAGE_BYTES } from "./constants";

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";
export type ImageRejectionCode =
  | "size_mismatch"
  | "unsupported_format"
  | "type_mismatch"
  | "invalid_image"
  | "animated_image"
  | "dimensions_out_of_range"
  | "too_many_pixels";

type ImageDetails = { mimeType: SupportedImageMime; width: number; height: number };
export type ImageValidationResult =
  | ({ valid: true; byteSize: number } & ImageDetails)
  | { valid: false; code: ImageRejectionCode };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function parseJpeg(bytes: Uint8Array): ImageDetails | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (length < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return { mimeType: "image/jpeg", width, height };
    }
    offset += length;
  }
  return null;
}

function parsePng(bytes: Uint8Array): ImageDetails | "animated" | null {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 12, 4) !== "IHDR" || view.getUint32(8) !== 13) return null;
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") return "animated";
    if (type === "IEND") break;
    offset = end;
  }
  return { mimeType: "image/png", width, height };
}

function parseWebp(bytes: Uint8Array): ImageDetails | "animated" | null {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let dimensions: { width: number; height: number } | null = null;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    const end = payload + length;
    if (end > bytes.length) return null;
    if (type === "ANIM") return "animated";
    if (type === "VP8X" && length >= 10) {
      if ((bytes[payload] & 0x02) !== 0) return "animated";
      dimensions = {
        width: readUint24LE(bytes, payload + 4) + 1,
        height: readUint24LE(bytes, payload + 7) + 1,
      };
    } else if (type === "VP8 " && length >= 10 && bytes[payload + 3] === 0x9d
      && bytes[payload + 4] === 0x01 && bytes[payload + 5] === 0x2a) {
      dimensions = {
        width: view.getUint16(payload + 6, true) & 0x3fff,
        height: view.getUint16(payload + 8, true) & 0x3fff,
      };
    } else if (type === "VP8L" && length >= 5 && bytes[payload] === 0x2f) {
      dimensions = {
        width: 1 + (((bytes[payload + 2] & 0x3f) << 8) | bytes[payload + 1]),
        height: 1 + (((bytes[payload + 4] & 0x0f) << 10)
          | (bytes[payload + 3] << 2) | ((bytes[payload + 2] & 0xc0) >> 6)),
      };
    }
    offset = end + (length % 2);
  }
  return dimensions ? { mimeType: "image/webp", ...dimensions } : null;
}

export function extensionForMime(mimeType: SupportedImageMime) {
  return mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
}

export function validateImageBytes(
  bytes: Uint8Array,
  declaredMimeType: SupportedImageMime,
  declaredByteSize: number,
): ImageValidationResult {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES || bytes.byteLength !== declaredByteSize) {
    return { valid: false, code: "size_mismatch" };
  }

  const parsed = parseJpeg(bytes) ?? parsePng(bytes) ?? parseWebp(bytes);
  if (parsed === "animated") return { valid: false, code: "animated_image" };
  if (!parsed) return { valid: false, code: "invalid_image" };
  if (parsed.mimeType !== declaredMimeType) return { valid: false, code: "type_mismatch" };
  if (parsed.width < 300 || parsed.height < 300 || parsed.width > 12000 || parsed.height > 12000) {
    return { valid: false, code: "dimensions_out_of_range" };
  }
  if (parsed.width * parsed.height > 80_000_000) return { valid: false, code: "too_many_pixels" };

  return { valid: true, byteSize: bytes.byteLength, ...parsed };
}
