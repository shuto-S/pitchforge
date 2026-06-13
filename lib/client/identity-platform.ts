"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  missingIdentityPlatformConfigKeys,
  resolveIdentityPlatformConfig
} from "@/lib/client/identity-platform-config";

const identityPlatformConfig = resolveIdentityPlatformConfig({
  NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY:
    process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY,
  NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN:
    process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN,
  NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID:
    process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID,
  NEXT_PUBLIC_IDENTITY_PLATFORM_APP_ID:
    process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_APP_ID
});

function validateIdentityPlatformConfig() {
  const missing = missingIdentityPlatformConfigKeys(identityPlatformConfig);
  if (missing.length > 0) {
    throw new Error("Identity Platform client configuration is missing.");
  }
}

export function getIdentityPlatformAuth() {
  validateIdentityPlatformConfig();
  const app =
    getApps().length > 0 ? getApp() : initializeApp(identityPlatformConfig);
  return getAuth(app);
}
