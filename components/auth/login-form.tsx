"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { safeLoginRedirect } from "@/lib/client/login-redirect";

type SessionResponse = {
  user?: {
    uid: string;
    email: string | null;
    displayName?: string | null;
    isAdmin: boolean;
    isInvited: boolean;
  };
  error?: string;
  code?: string;
};

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const isLocalAuth = process.env.NEXT_PUBLIC_AUTH_MODE === "local";
  const postLoginPath = safeLoginRedirect(redirectTo);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSigningIn(true);

    try {
      const response = await fetch(isLocalAuth ? "/api/auth/local" : "/api/auth/password", {
        method: "POST",
        headers: isLocalAuth ? undefined : { "content-type": "application/json" },
        body: isLocalAuth ? undefined : JSON.stringify({ loginId, password })
      });
      const payload = (await response.json().catch(() => ({}))) as SessionResponse;

      if (!response.ok || !payload.user) {
        if (response.status === 401) {
          setPassword("");
          setError("IDまたはパスワードが一致しません。");
          return;
        }
        throw new Error("Login failed");
      }

      router.replace(postLoginPath);
      router.refresh();
    } catch {
      setError("ログインできませんでした。時間をおいてもう一度お試しください。");
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <form
      onSubmit={signIn}
      className="rounded-2xl border border-white/10 bg-[#0e1422]/95 p-6 shadow-2xl shadow-black/30 sm:p-8"
    >
      <div className="flex flex-wrap gap-2 text-xs font-semibold tracking-wide text-slate-300">
        <span className="rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1.5">
          管理者発行アカウント
        </span>
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[2rem]">
        ワークスペースへログイン
      </h1>

      {isLocalAuth ? null : (
        <div className="mt-7 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-200">ログインID</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              required
              autoFocus
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c16] px-4 py-3.5 text-base text-white outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-200">パスワード</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#080c16] px-4 py-3.5 text-base text-white outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15"
            />
          </label>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-5 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-200"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSigningIn || (!isLocalAuth && (!loginId || !password))}
        aria-busy={isSigningIn}
        className="mt-7 w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e1422] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSigningIn ? "ログイン中…" : isLocalAuth ? "開発ワークスペースへ" : "ログイン"}
      </button>
    </form>
  );
}
