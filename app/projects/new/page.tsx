import { ProjectForm } from "@/components/project-form";
import Link from "next/link";
import { requirePageUser } from "@/lib/server/auth/page-auth";

export default async function NewProjectPage({
  searchParams
}: {
  searchParams: Promise<{ sample?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.sample === "1" ? "/projects/new?sample=1" : "/projects/new";
  await requirePageUser(nextPath);

  return (
    <main className="container py-12 lg:py-16">
      <div className="mb-10 max-w-3xl">
        <Link
          href="/"
          className="cockpit-kicker inline-flex items-center gap-2 hover:text-blue-300"
        >
          <span aria-hidden="true">←</span> PitchForge
        </Link>
        <div className="cockpit-kicker mt-9">01 / プロジェクト情報</div>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.035em] text-white md:text-5xl">
          <span className="block">GitHubから、</span>
          <span className="block">プロジェクト情報の下書きを。</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
          公開リポジトリを読み取り、プロダクトの価値と技術情報を整理します。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="cockpit-chip">URLだけで開始</span>
          <span className="cockpit-chip">AIで下書き</span>
          <span className="cockpit-chip">作成前に編集</span>
        </div>
      </div>
      <ProjectForm useSample={params.sample === "1"} />
    </main>
  );
}
