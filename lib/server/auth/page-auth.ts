import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieName, isAuthError, requireUser } from "@/lib/server/auth";

export async function requirePageUser(nextPath: string): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = getSessionCookieName();
  const sessionCookie = cookieStore.get(cookieName)?.value;
  const request = new Request("http://pitchforge.local", {
    headers: sessionCookie
      ? { cookie: `${cookieName}=${encodeURIComponent(sessionCookie)}` }
      : undefined
  });

  try {
    await requireUser(request);
  } catch (error) {
    if (isAuthError(error) && error.status === 401) {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    throw error;
  }
}
