import { describe, expect, it } from "vitest";
import {
  defaultLoginRedirect,
  safeLoginRedirect
} from "@/lib/client/login-redirect";

describe("safeLoginRedirect", () => {
  it("preserves allowed workspace and admin destinations", () => {
    expect(safeLoginRedirect("/projects/new?sample=1")).toBe(
      "/projects/new?sample=1"
    );
    expect(safeLoginRedirect("/projects/proj_0123456789abcdef?tab=artifacts#top")).toBe(
      "/projects/proj_0123456789abcdef?tab=artifacts#top"
    );
    expect(safeLoginRedirect("/admin/invites")).toBe("/admin/invites");
  });

  it.each([
    undefined,
    null,
    ["/projects/new"],
    "//example.com/projects/new",
    "/\\example.com/projects/new",
    "https://example.com/projects/new",
    "javascript:alert(1)",
    "/unknown",
    "/projects",
    "/unknown/../projects/new",
    "/%2f%2fexample.com"
  ])("falls back for an unsafe or unknown destination: %j", (candidate) => {
    expect(safeLoginRedirect(candidate)).toBe(defaultLoginRedirect);
  });
});
