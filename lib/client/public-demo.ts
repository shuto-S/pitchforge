export function shouldLoadCurrentUser(pathname: string): boolean {
  return pathname !== "/demo" && !pathname.startsWith("/demo/");
}
