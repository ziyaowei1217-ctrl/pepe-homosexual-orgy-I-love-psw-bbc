import { randomBytes } from "node:crypto";

export function productionEnvironment() {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://db.example.test/app?sslmode=require",
    WEB_ORIGIN: "https://app.example.test",
    VALKEY_URL: "rediss://cache.example.test:6379",
    JWT_SECRET: randomBytes(32).toString("hex"),
    OTP_HASH_SECRET: randomBytes(32).toString("hex"),
    SECURITY_IDENTIFIER_HASH_SECRET: randomBytes(32).toString("hex"),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    EMAIL_SENDER: "resend", EMAIL_FROM: "Test <test@example.test>", RESEND_API_KEY: "test-only",
    PAYMENT_SERVICE_URL: "https://payments.example.test/v1", PAYMENT_SERVICE_API_KEY: "test-only",
    LISTING_MEDIA_STORAGE_ENDPOINT: "http://internal-storage:9000",
    LISTING_MEDIA_UPLOAD_ENDPOINT: "https://uploads.example.test",
    LISTING_MEDIA_STORAGE_REGION: "us-east-1", LISTING_MEDIA_STORAGE_BUCKET: "test-only",
    LISTING_MEDIA_STORAGE_ACCESS_KEY_ID: "test-only", LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY: "test-only"
  };
}
