export function requireTestInfrastructure(environment = process.env) {
  const required = [
    "DATABASE_URL", "TEST_DATABASE_URL", "TEST_DATABASE_CONTAINER", "VALKEY_URL",
    "LISTING_MEDIA_STORAGE_ENDPOINT", "LISTING_MEDIA_UPLOAD_ENDPOINT", "LISTING_MEDIA_STORAGE_REGION",
    "LISTING_MEDIA_STORAGE_BUCKET", "LISTING_MEDIA_STORAGE_ACCESS_KEY_ID", "LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY"
  ];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) throw new Error(`Release tests require isolated infrastructure: ${missing.join(", ")}`);
  requireTestDatabase(environment);
}

export function requireTestDatabase(environment = process.env) {
  const missing = ["DATABASE_URL", "TEST_DATABASE_URL", "TEST_DATABASE_CONTAINER"].filter((name) => !environment[name]?.trim());
  if (missing.length) throw new Error(`Database tests require explicit isolated targets: ${missing.join(", ")}`);
  const base = new URL(environment.DATABASE_URL);
  const disposable = new URL(environment.TEST_DATABASE_URL);
  if (![base, disposable].every((url) => ["postgresql:", "postgres:"].includes(url.protocol))) {
    throw new Error("DATABASE_URL and TEST_DATABASE_URL must use PostgreSQL");
  }
  if (base.host !== disposable.host || base.username !== disposable.username || base.password !== disposable.password) {
    throw new Error("DATABASE_URL and TEST_DATABASE_URL must target the same isolated test server");
  }
}
