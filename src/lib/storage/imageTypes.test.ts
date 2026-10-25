import { test } from "node:test";
import assert from "node:assert/strict";
import { isRenderableImageType, looksLikeImage } from "./imageTypes.ts";

test("a HEIC that survived conversion is not shown in an <img>", () => {
  assert.equal(isRenderableImageType("image/heic"), false);
  assert.equal(isRenderableImageType("image/heif"), false);
});

test("a converted photo is", () => {
  assert.equal(isRenderableImageType("image/jpeg"), true);
  assert.equal(isRenderableImageType("IMAGE/PNG"), true);
});

test("a PDF is never previewed as an image", () => {
  assert.equal(isRenderableImageType("application/pdf"), false);
  assert.equal(isRenderableImageType(undefined), false);
});

test("a HEIC from the photo library is treated as an image so it gets converted", () => {
  assert.equal(looksLikeImage("IMG_0421.HEIC", "image/heic"), true);
  // Some pickers hand over no type at all; the extension is the only signal.
  assert.equal(looksLikeImage("IMG_0421.heic", ""), true);
  assert.equal(looksLikeImage("IMG_0421.jpg", undefined), true);
});

test("a typed non-image is left alone", () => {
  assert.equal(looksLikeImage("statement.pdf", "application/pdf"), false);
  assert.equal(looksLikeImage("notes.txt", "text/plain"), false);
});

test("an untyped file with no image extension is not converted", () => {
  assert.equal(looksLikeImage("statement.pdf", ""), false);
});
