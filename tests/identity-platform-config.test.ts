import { describe, expect, it } from "vitest";
import {
  missingIdentityPlatformConfigKeys,
  resolveIdentityPlatformConfig
} from "@/lib/client/identity-platform-config";

describe("Identity Platform client config", () => {
  it("uses Identity Platform env vars", () => {
    const config = resolveIdentityPlatformConfig({
      NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY: "identity-api-key",
      NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN: "identity.example.com",
      NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID: "identity-project"
    });

    expect(config).toEqual({
      apiKey: "identity-api-key",
      authDomain: "identity.example.com",
      projectId: "identity-project"
    });
  });

  it("reports missing required Identity Platform keys", () => {
    const config = resolveIdentityPlatformConfig({
      NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY: "identity-api-key"
    });

    expect(missingIdentityPlatformConfigKeys(config)).toEqual([
      "authDomain",
      "projectId"
    ]);
  });
});
