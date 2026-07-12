import { NextResponse } from "next/server";
import {
  MAX_SCREENSHOT_FILES,
  SCREENSHOT_UPLOAD_ERRORS,
  validateScreenshotFiles
} from "@/lib/asset-upload-validation";
import { requireProjectOwner } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/auth/request-security";
import { getRepository } from "@/lib/server/db";
import { AssetLimitExceededError } from "@/lib/server/db/types";
import { jsonError } from "@/lib/server/http";
import { getObjectStorage } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    assertSameOrigin(request);
    const { projectId } = await params;
    const repo = getRepository();
    const { user } = await requireProjectOwner(request, projectId, repo);

    const existing = await repo.listAssets(projectId);
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const validationError = validateScreenshotFiles(files, {
      existingCount: existing.length,
      requireAtLeastOne: true
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const storage = getObjectStorage();
    const uploadedAssets = [];
    try {
      for (const file of files) {
        const bytes = Buffer.from(await file.arrayBuffer());
        uploadedAssets.push(
          await storage.saveScreenshot({
            projectId,
            ownerUid: user.uid,
            fileName: file.name,
            mimeType: file.type,
            bytes
          })
        );
      }
      const assets = await repo.saveAssetsWithinLimit(
        projectId,
        uploadedAssets,
        MAX_SCREENSHOT_FILES
      );
      return NextResponse.json({ assets }, { status: 201 });
    } catch (error) {
      // GCS is not transactional with PostgreSQL, so compensate for every object
      // that was uploaded before storage or metadata registration failed.
      await Promise.allSettled(
        uploadedAssets.map((asset) => storage.deleteAsset?.(asset))
      );
      if (error instanceof AssetLimitExceededError) {
        return NextResponse.json(
          { error: SCREENSHOT_UPLOAD_ERRORS.count },
          { status: 400 }
        );
      }
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
