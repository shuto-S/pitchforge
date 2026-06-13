import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/server/db";
import { jsonError, notFound } from "@/lib/server/http";
import { getObjectStorage } from "@/lib/server/storage";

export const runtime = "nodejs";

const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxFileSize = 5 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const repo = getRepository();
    const project = await repo.getProject(projectId);
    if (!project) {
      return notFound("Project not found");
    }

    const existing = await repo.listAssets(projectId);
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);

    if (existing.length + files.length > 5) {
      return NextResponse.json(
        { error: "Screenshots are limited to 5 files per project" },
        { status: 400 }
      );
    }

    const storage = getObjectStorage();
    const assets = [];
    for (const file of files) {
      if (!allowedMimeTypes.has(file.type)) {
        return NextResponse.json(
          { error: "Only PNG, JPEG, and WebP screenshots are allowed" },
          { status: 400 }
        );
      }
      if (file.size > maxFileSize) {
        return NextResponse.json(
          { error: "Each screenshot must be 5MB or smaller" },
          { status: 400 }
        );
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const asset = await storage.saveScreenshot({
        projectId,
        fileName: file.name,
        mimeType: file.type,
        bytes
      });
      assets.push(await repo.saveAsset(asset));
    }

    return NextResponse.json({ assets }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
