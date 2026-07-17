import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createPublicImageDerivatives } from "../lib/media/public-image-derivatives";

test("creates bounded WebP variants without carrying source metadata", async () => {
  const source = await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: "#d9e4df" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "Private photographer" } })
    .toBuffer();

  const derivatives = await createPublicImageDerivatives(source);
  assert.deepEqual(derivatives.map((item) => item.variant), ["thumbnail", "card", "gallery"]);

  for (const derivative of derivatives) {
    const metadata = await sharp(derivative.bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.ok(derivative.width <= 1920);
    assert.ok(derivative.height <= 1440);
  }
});

test("never enlarges a validated source photograph", async () => {
  const source = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#168c91" },
  }).png().toBuffer();
  const derivatives = await createPublicImageDerivatives(source);
  for (const derivative of derivatives) {
    assert.ok(derivative.width <= 640);
    assert.ok(derivative.height <= 480);
  }
  assert.deepEqual(derivatives.map((item) => [item.width, item.height]), [
    [480, 360], [640, 480], [640, 480],
  ]);
});
