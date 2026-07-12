"use client";

import Image from "next/image";
import { useRef, useState } from "react";

const PNG_WIDTH = 1600;
const PNG_HEIGHT = 900;
const SVG_FILE_NAME = "pitchforge-architecture.svg";
const PNG_FILE_NAME = "pitchforge-architecture.png";

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("構成図SVGを画像として読み込めませんでした。"));
    image.src = source;
  });
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("PNGデータを生成できませんでした。"));
    }, "image/png");
  });
}

async function downloadObjectUrl(objectUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  try {
    anchor.click();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  } finally {
    anchor.remove();
  }
}

export function ArchitectureExport({ architectureUrl }: { architectureUrl?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationInFlightRef = useRef(false);
  const isAvailable = Boolean(architectureUrl);

  async function downloadPng() {
    if (!architectureUrl || generationInFlightRef.current) {
      return;
    }

    generationInFlightRef.current = true;
    setIsGenerating(true);
    setError(null);
    let svgObjectUrl: string | null = null;
    let pngObjectUrl: string | null = null;

    try {
      const response = await fetch(architectureUrl, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error("構成図SVGを取得できませんでした。ログイン状態を確認してください。");
      }

      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "image/svg+xml") {
        throw new Error("構成図の応答形式がSVGではありません。再実行してください。");
      }

      const svgBlob = await response.blob();
      svgObjectUrl = URL.createObjectURL(svgBlob);
      const image = await loadImage(svgObjectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = PNG_WIDTH;
      canvas.height = PNG_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("このブラウザではPNG変換を利用できません。");
      }
      context.drawImage(image, 0, 0, PNG_WIDTH, PNG_HEIGHT);

      const pngBlob = await canvasToPng(canvas);
      pngObjectUrl = URL.createObjectURL(pngBlob);
      await downloadObjectUrl(pngObjectUrl, PNG_FILE_NAME);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "構成図PNGの生成に失敗しました。");
    } finally {
      if (svgObjectUrl) {
        URL.revokeObjectURL(svgObjectUrl);
      }
      if (pngObjectUrl) {
        URL.revokeObjectURL(pngObjectUrl);
      }
      generationInFlightRef.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-6">
      <h3 className="text-lg font-semibold">システム構成図</h3>
      <p id="architecture-export-description" className="mt-2 text-sm leading-6 text-muted">
        1600×900の構成図を確認し、編集可能なSVGまたはアップロードしやすいPNGで保存できます。
      </p>

      {architectureUrl ? (
        <div className="mt-4 overflow-hidden rounded-md border border-line bg-white">
          <Image
            src={architectureUrl}
            alt="PitchForgeのGoogle CloudとAIエージェント処理を示す構成図"
            width={PNG_WIDTH}
            height={PNG_HEIGHT}
            unoptimized
            className="h-auto w-full"
          />
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-line bg-white p-6 text-sm leading-6 text-muted">
          構成図はAI改善が完了し、成果物が生成されると利用できます。
        </div>
      )}

      <div
        className="mt-4 flex flex-wrap gap-3"
        aria-describedby="architecture-export-description"
        aria-busy={isGenerating}
      >
        {architectureUrl ? (
          <a
            href={architectureUrl}
            download={SVG_FILE_NAME}
            className="rounded-md border border-line bg-white px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forge focus-visible:ring-offset-2"
          >
            SVGをダウンロード
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line bg-white px-4 py-3 text-sm font-semibold opacity-50"
          >
            SVGをダウンロード
          </span>
        )}
        <button
          type="button"
          disabled={!isAvailable || isGenerating}
          onClick={downloadPng}
          className="rounded-md border border-line bg-white px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forge focus-visible:ring-offset-2"
        >
          {isGenerating ? "PNGを生成中…" : "PNGを生成してダウンロード"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
