type EnvRecord = Record<string, string | undefined>;

const requiredKeys = [
  "PORT",
  "DATABASE_URL",
  "JWT_SECRET",
  "APP_ORIGIN",
  "MINIO_ENDPOINT",
  "MINIO_PORT",
  "MINIO_USE_SSL",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_BUCKET",
];

export function validateEnvironment(config: EnvRecord) {
  const missing = requiredKeys.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    ...config,
    PORT: Number(config.PORT),
  };
}

