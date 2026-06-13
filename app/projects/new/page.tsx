import { ProjectForm } from "@/components/project-form";
import Link from "next/link";

export default async function NewProjectPage({
  searchParams
}: {
  searchParams: Promise<{ sample?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="container py-10">
      <div className="mb-8 max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-muted hover:text-ink">
          PitchForge
        </Link>
        <h1 className="mt-5 text-4xl font-semibold tracking-normal">
          作品をAI監督に見せる
        </h1>
        <p className="mt-4 leading-7 text-muted">
          作品名、課題、GCPの使い方、AIエージェントとしての振る舞いを入力してください。
          スクリーンショットは最大5枚までアップロードできます。
        </p>
      </div>
      <ProjectForm useSample={params.sample === "1"} />
    </main>
  );
}
