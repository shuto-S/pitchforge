export type IdentityPlatformEnv = {
  NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY?: string;
  NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID?: string;
  NEXT_PUBLIC_IDENTITY_PLATFORM_APP_ID?: string;
};

export function resolveIdentityPlatformConfig(env: IdentityPlatformEnv) {
  return {
    apiKey: env.NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY,
    authDomain: env.NEXT_PUBLIC_IDENTITY_PLATFORM_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_IDENTITY_PLATFORM_PROJECT_ID,
    appId: env.NEXT_PUBLIC_IDENTITY_PLATFORM_APP_ID
  };
}

export function missingIdentityPlatformConfigKeys(
  config: ReturnType<typeof resolveIdentityPlatformConfig>
) {
  return Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
