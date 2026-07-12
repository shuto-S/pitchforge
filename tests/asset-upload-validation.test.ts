import { describe, expect, it } from "vitest";
import {
  MAX_SCREENSHOT_FILE_SIZE_BYTES,
  SCREENSHOT_UPLOAD_ERRORS,
  validateScreenshotFiles
} from "@/lib/asset-upload-validation";

describe("screenshot upload validation", () => {
  it("accepts up to five PNG, JPEG, or WebP files of at most 5 MiB", () => {
    const files = [
      { type: "image/png", size: MAX_SCREENSHOT_FILE_SIZE_BYTES },
      { type: "image/jpeg", size: 1 },
      { type: "image/webp", size: 1 }
    ];

    expect(validateScreenshotFiles(files, { existingCount: 2 })).toBeNull();
  });

  it("rejects the complete selection when count, type, or size is invalid", () => {
    expect(
      validateScreenshotFiles(Array.from({ length: 6 }, () => ({ type: "image/png", size: 1 })))
    ).toBe(SCREENSHOT_UPLOAD_ERRORS.count);
    expect(
      validateScreenshotFiles([
        { type: "image/png", size: 1 },
        { type: "image/gif", size: 1 }
      ])
    ).toBe(SCREENSHOT_UPLOAD_ERRORS.type);
    expect(
      validateScreenshotFiles([
        { type: "image/png", size: 1 },
        { type: "image/webp", size: MAX_SCREENSHOT_FILE_SIZE_BYTES + 1 }
      ])
    ).toBe(SCREENSHOT_UPLOAD_ERRORS.size);
  });

  it("can explicitly require a non-empty upload", () => {
    expect(validateScreenshotFiles([], { requireAtLeastOne: true })).toBe(
      SCREENSHOT_UPLOAD_ERRORS.empty
    );
    expect(validateScreenshotFiles([])).toBeNull();
  });
});
