import { expect, it } from "vitest";
import { assertProductionRuntimeConfig, getListingMediaStorageConfig } from "../src/config/env";
import { createPaymentCommands } from "../src/payments/payment-commands";
import { productionEnvironment } from "./support/production-environment";

it.each([
  ["WEB_ORIGIN", "https://user:password@app.example.test"],
  ["PAYMENT_SERVICE_URL", "https://payments.example.test?tenant=one"],
  ["PAYMENT_SERVICE_URL", "https://user:password@payments.example.test"],
  ["PAYMENT_SERVICE_URL", "https://payments.example.test/#fragment"],
  ["LISTING_MEDIA_UPLOAD_ENDPOINT", "http://uploads.example.test"],
  ["LISTING_MEDIA_UPLOAD_ENDPOINT", "https://user:password@uploads.example.test"],
  ["EMAIL_FROM", "Sublet Pipeline <no-reply@example.com>"],
  ["RESEND_API_KEY", "   "],
  ["MFA_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64")]
])("rejects unsafe %s in actual API startup", (name, value) => {
  expect(() => assertProductionRuntimeConfig({ ...productionEnvironment(), [name]: value })).toThrow();
});

it.each(["https://payments.example.test?tenant=one", "https://a:b@payments.example.test", "https://payments.example.test/#fragment"])(
  "rejects an ambiguous payment base URL before constructing request paths", (serviceUrl) => {
    expect(() => createPaymentCommands({ nodeEnv: "production", serviceUrl, apiKey: "test-only" })).toThrow();
  }
);

it("requires HTTPS browser upload URLs even if the storage factory is called directly", () => {
  expect(() => getListingMediaStorageConfig({ nodeEnv: "production", endpoint: "http://internal-storage:9000",
    uploadEndpoint: "http://uploads.example.test", region: "us-east-1", bucket: "test", accessKeyId: "test", secretAccessKey: "test"
  })).toThrow();
});

it("accepts the complete synthetic backend production contract without contacting providers", () => {
  expect(() => assertProductionRuntimeConfig(productionEnvironment())).not.toThrow();
});
