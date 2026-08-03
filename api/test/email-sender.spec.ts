import { describe, expect, it, vi } from "vitest";

import {
  ConsoleEmailSender,
  createEmailSender,
  ResendEmailSender
} from "../src/email/email-sender";

describe("Resend email delivery", () => {
  it("sends text and HTML without putting the code in the subject and uses record idempotency", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const sender = new ResendEmailSender({
      apiKey: "re_test",
      from: "Sublet Pipeline <login@example.com>",
      fetchImpl
    });

    const result = await sender.sendVerificationCode({
      email: "student@example.com",
      code: "123456",
      verificationCodeId: "code-record-1"
    });

    expect(result).toEqual({ providerMessageId: "resend-message-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = request.headers as Record<string, string>;
    const body = JSON.parse(String(request.body)) as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("verification-code/code-record-1");
    expect(body.subject).not.toContain("123456");
    expect(body.text).toContain("123456");
    expect(body.html).toContain("123456");
  });

  it("retries once for a 5xx response and never retries a 4xx response", async () => {
    const retryingFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "message-2" }), { status: 200 }));
    const retryingSender = new ResendEmailSender({
      apiKey: "re_test",
      from: "login@example.com",
      fetchImpl: retryingFetch
    });
    await expect(
      retryingSender.sendVerificationCode({
        email: "student@example.com",
        code: "123456",
        verificationCodeId: "code-record-2"
      })
    ).resolves.toEqual({ providerMessageId: "message-2" });
    expect(retryingFetch).toHaveBeenCalledTimes(2);

    const rejectedFetch = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    const rejectedSender = new ResendEmailSender({
      apiKey: "re_test",
      from: "login@example.com",
      fetchImpl: rejectedFetch
    });
    await expect(
      rejectedSender.sendVerificationCode({
        email: "student@example.com",
        code: "123456",
        verificationCodeId: "code-record-3"
      })
    ).rejects.toThrow("Email delivery unavailable");
    expect(rejectedFetch).toHaveBeenCalledTimes(1);
  });

  it("retries once when the provider request times out", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("request timed out", "TimeoutError"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "message-after-timeout" }), { status: 200 }));
    const sender = new ResendEmailSender({ apiKey: "re_test", from: "login@example.com", fetchImpl });

    await expect(
      sender.sendVerificationCode({
        email: "student@example.com",
        code: "123456",
        verificationCodeId: "code-timeout"
      })
    ).resolves.toEqual({ providerMessageId: "message-after-timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries once for an HTTP 408 provider timeout", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("request timeout", { status: 408 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "message-after-408" }), { status: 200 }));
    const sender = new ResendEmailSender({ apiKey: "re_test", from: "login@example.com", fetchImpl });

    await expect(
      sender.sendVerificationCode({
        email: "student@example.com",
        code: "123456",
        verificationCodeId: "code-408"
      })
    ).resolves.toEqual({ providerMessageId: "message-after-408" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("allows console only outside production and fails production configuration synchronously", () => {
    expect(createEmailSender({ nodeEnv: "development", emailSender: "console" })).toBeInstanceOf(ConsoleEmailSender);
    expect(() =>
      createEmailSender({ nodeEnv: "production", emailSender: "console", resendApiKey: "re_test", emailFrom: "a@b.co" })
    ).toThrow("Production email sender must be resend");
    expect(() => createEmailSender({ nodeEnv: "production", emailSender: "resend" })).toThrow(
      "Production Resend configuration is required"
    );
    expect(
      createEmailSender({
        nodeEnv: "production",
        emailSender: "resend",
        resendApiKey: "re_test",
        emailFrom: "Sublet Pipeline <login@example.com>"
      })
    ).toBeInstanceOf(ResendEmailSender);
  });
});
