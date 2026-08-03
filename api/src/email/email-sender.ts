export type SendVerificationCodeInput = {
  email: string;
  code: string;
  verificationCodeId: string;
};

export type SendVerificationCodeResult = {
  providerMessageId?: string;
};

export type EmailSender = {
  sendVerificationCode(input: SendVerificationCodeInput): Promise<SendVerificationCodeResult>;
};

type EmailSenderFactoryInput = {
  nodeEnv?: string;
  emailSender?: string;
  resendApiKey?: string;
  emailFrom?: string;
};

type ResendEmailSenderOptions = {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  timeoutSignal?: (milliseconds: number) => AbortSignal;
};

export const EMAIL_PROVIDER_TOTAL_TIMEOUT_MS = 5_000;

export class EmailDeliveryUnavailableError extends Error {
  constructor() {
    super("Email delivery unavailable");
    this.name = "EmailDeliveryUnavailableError";
  }
}

export class ConsoleEmailSender implements EmailSender {
  async sendVerificationCode(input: SendVerificationCodeInput) {
    console.log(`[dev email] verification-code/${input.verificationCodeId} accepted`);
    return {};
  }
}

export class ResendEmailSender implements EmailSender {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly timeoutSignal: (milliseconds: number) => AbortSignal;

  constructor(private readonly options: ResendEmailSenderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? EMAIL_PROVIDER_TOTAL_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.timeoutSignal = options.timeoutSignal ?? AbortSignal.timeout;
  }

  async sendVerificationCode(input: SendVerificationCodeInput) {
    const request = (signal: AbortSignal) =>
      this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `verification-code/${input.verificationCodeId}`
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [input.email],
          subject: "Your Sublet Pipeline verification code",
          text: `Your verification code is ${input.code}. It expires soon.`,
          html: `<p>Your verification code is <strong>${input.code}</strong>.</p><p>It expires soon.</p>`
        }),
        signal
      });

    const deadline = this.now() + this.timeoutMs;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) throw new EmailDeliveryUnavailableError();
      try {
        const response = await request(this.timeoutSignal(remainingMs));
        if (response.ok) {
          const payload = (await response.json()) as { id?: unknown };
          return { providerMessageId: typeof payload.id === "string" ? payload.id : undefined };
        }
        if ((response.status !== 408 && response.status < 500) || attempt === 1) {
          throw new EmailDeliveryUnavailableError();
        }
      } catch (error) {
        if (error instanceof EmailDeliveryUnavailableError || attempt === 1 || !isRetryableNetworkError(error)) {
          throw new EmailDeliveryUnavailableError();
        }
      }
    }

    throw new EmailDeliveryUnavailableError();
  }
}

export function createEmailSender(input: EmailSenderFactoryInput = {}): EmailSender {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const emailSender = input.emailSender ?? process.env.EMAIL_SENDER ?? "console";

  if (nodeEnv === "production") {
    if (emailSender !== "resend") throw new Error("Production email sender must be resend");
    const apiKey = input.resendApiKey ?? process.env.RESEND_API_KEY;
    const from = input.emailFrom ?? process.env.EMAIL_FROM;
    if (!apiKey || !from) throw new Error("Production Resend configuration is required");
    return new ResendEmailSender({ apiKey, from });
  }

  if (emailSender !== "console") throw new Error("Console email sender is required outside production");
  return new ConsoleEmailSender();
}

function isRetryableNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}
