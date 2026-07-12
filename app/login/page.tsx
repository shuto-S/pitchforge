import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { safeLoginRedirect } from "@/lib/client/login-redirect";

const proofPoints = [
  ["05", "評価観点"],
  ["02", "改善サイクル"],
  ["1", "成果物セット"]
];

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;

  return (
    <main className="relative min-h-[calc(100vh-65px)] overflow-hidden bg-[#070a12]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_75%_80%,rgba(99,102,241,0.14),transparent_32%)]" />
      <div className="container relative grid min-h-[calc(100vh-65px)] items-center gap-12 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <section className="max-w-2xl">
          <Link href="/" className="text-sm font-semibold text-blue-300 hover:text-white">
            PitchForge
          </Link>
          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
            AIプロダクト評価
          </p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            プロダクト評価を、
            <span className="block">改善と資料作成へ。</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
            5観点評価、改善対象の選択、再評価、審査・レビュー向け資料の生成までを一つの画面で追えます。
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {proofPoints.map(([value, label]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-2xl font-semibold tabular-nums text-white">{value}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="w-full max-w-md justify-self-end">
          <LoginForm redirectTo={safeLoginRedirect(params.next)} />
        </div>
      </div>
    </main>
  );
}
