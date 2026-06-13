import Link from "next/link";
import { InviteManager } from "@/components/admin/invite-manager";

export default function AdminInvitesPage() {
  return (
    <main className="container py-10">
      <div className="mb-8 max-w-3xl">
        <Link href="/projects/new" className="text-sm font-semibold text-muted hover:text-ink">
          ワークスペースに戻る
        </Link>
        <h1 className="mt-5 text-4xl font-semibold tracking-normal">招待管理</h1>
        <p className="mt-4 leading-7 text-muted">
          PitchForgeにアクセスできるユーザーをメールアドレスで管理します。
        </p>
      </div>
      <InviteManager />
    </main>
  );
}
