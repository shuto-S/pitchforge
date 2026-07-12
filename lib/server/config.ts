export type DatabaseMode = "postgres";
export type StorageMode = "gcs";
export type AiProviderMode = "auto" | "mock" | "gemini";
export type AuthMode = "identity-platform" | "local" | "password";

function readMode<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function getRuntimeConfig() {
  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";
  const hasApiKey = Boolean(process.env.GEMINI_API_KEY);

  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "PitchForge",
    demoMode: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
    aiProvider: readMode<AiProviderMode>(
      process.env.AI_PROVIDER,
      ["auto", "mock", "gemini"],
      "auto"
    ),
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    useVertex,
    hasGeminiApiKey: hasApiKey,
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
    googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
    databaseMode: readMode<DatabaseMode>(
      process.env.DATABASE_MODE,
      ["postgres"],
      "postgres"
    ),
    storageMode: readMode<StorageMode>(
      process.env.STORAGE_MODE,
      ["gcs"],
      "gcs"
    ),
    databaseUrl: process.env.DATABASE_URL,
    gcsBucket: process.env.GCS_BUCKET,
    gcsApiEndpoint: process.env.GCS_API_ENDPOINT,
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "__session",
    authMode: readMode<AuthMode>(
      process.env.AUTH_MODE,
      ["identity-platform", "local", "password"],
      "password"
    ),
    authSessionSecret: process.env.AUTH_SESSION_SECRET ?? "",
    authAdminEmails: process.env.AUTH_ADMIN_EMAILS ?? "",
    localAuthUid: process.env.LOCAL_AUTH_UID ?? "local-user",
    localAuthEmail: process.env.LOCAL_AUTH_EMAIL ?? "local-user@example.test",
    localAuthDisplayName: process.env.LOCAL_AUTH_DISPLAY_NAME ?? "Local User",
    localAuthSecret: process.env.LOCAL_AUTH_SECRET ?? "local-development-secret",
    authBypassForTest:
      process.env.AUTH_BYPASS_FOR_TEST === "true" && process.env.NODE_ENV !== "production",
    isCloudRun: Boolean(process.env.K_SERVICE)
  };
}

export function getPublicRuntimeStatus() {
  const config = getRuntimeConfig();
  const resolvedAiMode =
    config.aiProvider === "mock" ||
    (!config.useVertex && !config.hasGeminiApiKey && config.aiProvider === "auto")
      ? "mock"
      : config.useVertex
        ? "vertex-gemini"
        : "api-key-gemini";

  return {
    runtimeMode: config.isCloudRun ? "cloud-run" : "local",
    aiMode: resolvedAiMode,
    datastoreMode: config.databaseMode,
    storageMode: config.storageMode,
    authMode: config.authBypassForTest ? "test-bypass" : config.authMode,
    cloudRunService: process.env.K_SERVICE ? "configured" : "not-configured",
    googleCloudProject: config.googleCloudProject ? "configured" : "not-configured",
    gcsBucket: config.gcsBucket ? "configured" : "not-configured"
  };
}
