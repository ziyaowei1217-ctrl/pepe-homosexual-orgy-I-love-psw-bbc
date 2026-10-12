import { describe, expect, it } from "vitest";
import { getMfaEncryptionKey } from "../src/config/env";

const key = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

describe("MFA encryption configuration", () => {
  it("provides exactly 32 decoded bytes for AES-256-GCM", () => {
    expect(getMfaEncryptionKey({ nodeEnv: "production", mfaEncryptionKey: key }).toString()).toBe("0123456789abcdef0123456789abcdef");
  });
  it.each(["", "x", "YQ==", key.slice(0, -1), ` ${key}`, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="])(
    "rejects missing, malformed or public zero encryption keys (%s)", (mfaEncryptionKey) => {
      expect(() => getMfaEncryptionKey({ nodeEnv: "production", mfaEncryptionKey })).toThrow(/MFA_ENCRYPTION_KEY/);
    }
  );
  it("keeps a development fallback without accepting it in production", () => {
    const development = getMfaEncryptionKey({ nodeEnv: "development", mfaEncryptionKey: "" });
    expect(development.length).toBe(32);
    expect(() => getMfaEncryptionKey({ nodeEnv: "production", mfaEncryptionKey: development.toString("base64") })).toThrow();
  });
});
