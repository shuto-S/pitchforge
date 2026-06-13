"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getIdentityPlatformAuth } from "@/lib/client/identity-platform";

type CurrentUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
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

  useEffect(() => {
    let isMounted = true;

    fetch("/api/auth/me")
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
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    try {
      await signOut(getIdentityPlatformAuth());
    } catch {
      // Server session logout is the source of truth here.
    }
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-panel/85 backdrop-blur">
      <div className="container flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
        <Link href="/" className="text-sm font-semibold text-ink">
          PitchForge
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          {user?.isAdmin ? (
            <Link href="/admin/invites" className="font-semibold text-muted hover:text-ink">
              招待管理
            </Link>
          ) : null}
          {user ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="max-w-[220px] truncate text-muted">
                {user.displayName || user.email || "ログイン中"}
              </span>
              <button
                type="button"
                onClick={logout}
                disabled={isLoggingOut}
                className="rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? "ログアウト中..." : "ログアウト"}
              </button>
            </div>
          ) : isLoading ? null : (
            <Link
              href="/login"
              className="rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink transition hover:border-ink"
            >
              ログイン
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
