import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteManager } from "@/components/admin/invite-manager";
import { getRuntimeConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function AdminInvitesPage() {
  if (getRuntimeConfig().authMode !== "identity-platform") {
    notFound();
  }

  return (
    <main className="container py-10">
      <div className="mb-8 max-w-3xl">
        <Link href="/projects/new" className="text-sm font-semibold text-muted hover:text-ink">
          ワークスペースに戻る
        </Link>
        <h1 className="mt-5 text-4xl font-semibold tracking-normal">招待管理</h1>
        <p className="mt-4 leading-7 text-muted">
          SaaSとして公開しても無制限に使われないよう、利用できるユーザーをメールアドレスで制御します。
        </p>
      </div>
      <InviteManager />
    </main>
  );
}
