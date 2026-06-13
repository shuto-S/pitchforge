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
      NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID: "identity-project",
      NEXT_PUBLIC_IDENTITY_PLATFORM_APP_ID: "identity-app"
    });

    expect(config).toEqual({
      apiKey: "identity-api-key",
      authDomain: "identity.example.com",
      projectId: "identity-project",
      appId: "identity-app"
    });
  });

  it("reports missing required Identity Platform keys", () => {
    const config = resolveIdentityPlatformConfig({
      NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY: "identity-api-key"
    });

    expect(missingIdentityPlatformConfigKeys(config)).toEqual([
      "authDomain",
      "projectId",
      "appId"
    ]);
  });
});
