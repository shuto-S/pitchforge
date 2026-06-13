export type DatastoreMode = "local" | "firestore";
export type StorageMode = "local" | "gcs";
export type AiProviderMode = "auto" | "mock" | "gemini";

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
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
    useVertex,
    hasGeminiApiKey: hasApiKey,
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
    googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
    datastoreMode: readMode<DatastoreMode>(
      process.env.DATASTORE_MODE,
      ["local", "firestore"],
      "local"
    ),
    storageMode: readMode<StorageMode>(
      process.env.STORAGE_MODE,
      ["local", "gcs"],
      "local"
    ),
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID ?? "(default)",
    gcsBucket: process.env.GCS_BUCKET,
    localDataDir: process.env.LOCAL_DATA_DIR ?? ".local-data",
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "__session",
    authAdminEmails: process.env.AUTH_ADMIN_EMAILS ?? "",
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
    datastoreMode: config.datastoreMode,
    storageMode: config.storageMode,
    authMode: config.authBypassForTest ? "test-bypass" : "firebase",
    cloudRunService: process.env.K_SERVICE ? "configured" : "not-configured",
    googleCloudProject: config.googleCloudProject ? "configured" : "not-configured",
    gcsBucket: config.gcsBucket ? "configured" : "not-configured"
  };
}
