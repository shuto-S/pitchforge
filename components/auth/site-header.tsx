"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type CurrentUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  isAdmin: boolean;
  isInvited: boolean;
};

type MeResponse = {
  user?: CurrentUser;
};

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const payload = (await response.json()) as MeResponse;
        return payload.user ?? null;
      })
      .then((nextUser) => {
        if (isMounted) {
          setUser(nextUser);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  async function logout() {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Server logout failed");
      }
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch {
      setLogoutError("ログアウトできませんでした。");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070a12]/85 backdrop-blur-xl">
      <div className="container flex min-h-16 items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-baseline gap-2 text-white">
          <span className="text-sm font-semibold tracking-[-0.02em]">PitchForge</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm" aria-label="アカウント">
          {user ? (
            <>
              <span className="hidden max-w-[220px] truncate text-slate-400 sm:block">
                {user.displayName || user.email || "ログイン中"}
              </span>
              <button
                type="button"
                onClick={logout}
                disabled={isLoggingOut}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoggingOut ? "処理中…" : "ログアウト"}
              </button>
            </>
          ) : isLoading ? null : (
            <Link
              href="/login"
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-200 transition hover:border-blue-400/40 hover:bg-blue-400/10"
            >
              ログイン
            </Link>
          )}
          {logoutError ? (
            <p role="alert" className="text-xs font-medium text-red-300">
              {logoutError}
            </p>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
