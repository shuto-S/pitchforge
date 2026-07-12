export const MAX_SCREENSHOT_FILES = 5;
export const MAX_SCREENSHOT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_SCREENSHOT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;
const allowedScreenshotMimeTypes = new Set<string>(ALLOWED_SCREENSHOT_MIME_TYPES);

export const SCREENSHOT_UPLOAD_ERRORS = {
  empty: "At least one screenshot is required",
  count: "Screenshots are limited to 5 files per project",
  type: "Only PNG, JPEG, and WebP screenshots are allowed",
  size: "Each screenshot must be 5MB or smaller"
} as const;

type ScreenshotFile = {
  type: string;
  size: number;
};

type ScreenshotValidationOptions = {
  existingCount?: number;
  requireAtLeastOne?: boolean;
};

export function validateScreenshotFiles(
  files: readonly ScreenshotFile[],
  { existingCount = 0, requireAtLeastOne = false }: ScreenshotValidationOptions = {}
): string | null {
  if (requireAtLeastOne && files.length === 0) {
    return SCREENSHOT_UPLOAD_ERRORS.empty;
  }
  if (existingCount + files.length > MAX_SCREENSHOT_FILES) {
    return SCREENSHOT_UPLOAD_ERRORS.count;
  }

  for (const file of files) {
    if (!allowedScreenshotMimeTypes.has(file.type)) {
      return SCREENSHOT_UPLOAD_ERRORS.type;
    }
    if (file.size > MAX_SCREENSHOT_FILE_SIZE_BYTES) {
      return SCREENSHOT_UPLOAD_ERRORS.size;
    }
  }

  return null;
}
