import assert from "node:assert/strict";
import test from "node:test";
import { validateImageBytes } from "../lib/media/image-validation";

function png(width: number, height: number, animated = false) {
  const bytes = new Uint8Array(animated ? 45 : 33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  if (animated) bytes.set([0x61, 0x63, 0x54, 0x4c], 37);
  return bytes;
}

function jpeg(width: number, height: number) {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
}

function webp(width: number, height: number) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  view.setUint32(4, 22, true);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  view.setUint32(16, 10, true);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set([encodedWidth & 0xff, (encodedWidth >> 8) & 0xff, (encodedWidth >> 16) & 0xff], 24);
  bytes.set([encodedHeight & 0xff, (encodedHeight >> 8) & 0xff, (encodedHeight >> 16) & 0xff], 27);
  return bytes;
}

test("accepts still JPEG, PNG, and WebP signatures with safe dimensions", () => {
  for (const [bytes, mimeType] of [
    [jpeg(800, 600), "image/jpeg"],
    [png(800, 600), "image/png"],
    [webp(800, 600), "image/webp"],
  ] as const) {
    const result = validateImageBytes(bytes, mimeType, bytes.length);
    assert.equal(result.valid, true);
    if (result.valid) assert.deepEqual([result.width, result.height], [800, 600]);
  }
});

test("rejects an image whose declared MIME type does not match its bytes", () => {
  const bytes = png(800, 600);
  assert.deepEqual(validateImageBytes(bytes, "image/jpeg", bytes.length), { valid: false, code: "type_mismatch" });
});

test("rejects animated PNG content", () => {
  const bytes = png(800, 600, true);
  assert.deepEqual(validateImageBytes(bytes, "image/png", bytes.length), { valid: false, code: "animated_image" });
});

test("rejects corrupt content even when its filename MIME claim is supported", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.deepEqual(validateImageBytes(bytes, "image/jpeg", bytes.length), { valid: false, code: "invalid_image" });
});

test("rejects a byte-size mismatch", () => {
  const bytes = jpeg(800, 600);
  assert.deepEqual(validateImageBytes(bytes, "image/jpeg", bytes.length + 1), { valid: false, code: "size_mismatch" });
});

test("rejects dimensions below the safe minimum", () => {
  const bytes = png(299, 600);
  assert.deepEqual(validateImageBytes(bytes, "image/png", bytes.length), { valid: false, code: "dimensions_out_of_range" });
});

test("rejects decompression-risk pixel counts", () => {
  const bytes = png(10000, 9000);
  assert.deepEqual(validateImageBytes(bytes, "image/png", bytes.length), { valid: false, code: "too_many_pixels" });
});
