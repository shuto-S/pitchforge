"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/client/firebase";

type SessionResponse = {
  user?: {
    uid: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    isAdmin: boolean;
    isInvited: boolean;
  };
  error?: string;
  code?: string;
};

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function signIn() {
    setError(null);
    setIsSigningIn(true);

    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = await credential.user.getIdToken();

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken })
      });
      const payload = (await response.json().catch(() => ({}))) as SessionResponse;

      if (response.status === 403 && payload.code === "INVITE_REQUIRED") {
        await signOut(auth).catch(() => undefined);
        setError(
          "このメールアドレスはまだ招待されていません。管理者からの招待後にもう一度ログインしてください。"
        );
        return;
      }

      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? "ログインに失敗しました。");
      }

      router.push("/projects/new");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインに失敗しました。");
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-6 shadow-soft">
      <div>
        <h1 className="text-4xl font-semibold tracking-normal">ログイン</h1>
        <p className="mt-4 leading-7 text-muted">
          Googleアカウントでログインしてください。PitchForgeは招待されたユーザーのみ利用できます。
        </p>
      </div>

      {error ? (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={signIn}
        disabled={isSigningIn}
        className="mt-7 w-full rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forge disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSigningIn ? "ログイン中..." : "Googleでログイン"}
      </button>
    </div>
  );
}
