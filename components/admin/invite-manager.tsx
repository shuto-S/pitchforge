"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Invite = {
  id?: string;
  email: string;
  createdAt?: string;
  createdBy?: string;
};

type InvitesResponse = {
  invites?: Invite[];
  invite?: Invite;
  error?: string;
};

export function InviteManager() {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchInvites = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/invites");
      const payload = (await response.json().catch(() => ({}))) as InvitesResponse;

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (response.status === 403) {
        setError("招待管理は管理者のみ利用できます。");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "招待一覧の取得に失敗しました。");
      }

      setInvites(payload.invites ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "招待一覧の取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: nextEmail })
      });
      const payload = (await response.json().catch(() => ({}))) as InvitesResponse;

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (response.status === 403) {
        setError("招待管理は管理者のみ利用できます。");
        return;
      }

      if (!response.ok || !payload.invite) {
        throw new Error(payload.error ?? "招待の作成に失敗しました。");
      }

      const createdInvite = payload.invite;
      setInvites((current) => [
        createdInvite,
        ...current.filter((invite) => invite.email !== createdInvite.email)
      ]);
      setEmail("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "招待の作成に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form
        onSubmit={submit}
        className="h-fit rounded-lg border border-line bg-panel p-6 shadow-soft"
      >
        <h2 className="text-xl font-semibold">新しい招待</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Googleログイン後に利用を許可するメールアドレスを追加します。
        </p>
        <label className="mt-5 block">
          <span className="text-sm font-semibold">メールアドレス</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            className="mt-2 w-full rounded-md border border-line bg-white px-3 py-3 text-sm"
          />
        </label>
        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-forge disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "追加中..." : "招待を追加"}
        </button>
      </form>

      <section className="rounded-lg border border-line bg-panel p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 className="text-xl font-semibold">招待済みユーザー</h2>
            <p className="mt-1 text-sm text-muted">{invites.length}件</p>
          </div>
          <button
            type="button"
            onClick={fetchInvites}
            disabled={isLoading}
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            再読み込み
          </button>
        </div>

        {isLoading ? (
          <p className="py-8 text-sm text-muted">読み込み中...</p>
        ) : invites.length > 0 ? (
          <ul className="divide-y divide-line">
            {invites.map((invite) => (
              <li
                key={invite.id ?? invite.email}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <span className="font-semibold">{invite.email}</span>
                {invite.createdAt ? (
                  <span className="text-sm text-muted">{invite.createdAt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-8 text-sm leading-6 text-muted">
            まだ招待はありません。最初の利用者を追加すると、そのユーザーだけがワークスペースに入れます。
          </div>
        )}
      </section>
    </div>
  );
}
