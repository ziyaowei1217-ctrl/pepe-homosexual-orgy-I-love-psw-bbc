export type SendVerificationCodeInput = {
  email: string;
  code: string;
};

export type EmailSender = {
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
};

type EmailSenderFactoryInput = {
  nodeEnv?: string;
  emailSender?: string;
};

export class ConsoleEmailSender implements EmailSender {
  async sendVerificationCode(input: SendVerificationCodeInput) {
    console.log(`[dev email code] ${input.email}: ${input.code}`);
  }
}

export class MissingProductionEmailSender implements EmailSender {
  async sendVerificationCode() {
    throw new Error("Production email sender is not configured");
  }
}

export function createEmailSender(input: EmailSenderFactoryInput = {}): EmailSender {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const emailSender = input.emailSender ?? process.env.EMAIL_SENDER ?? "console";

  if (nodeEnv === "production") {
    return new MissingProductionEmailSender();
  }

  if (emailSender !== "console") {
    return new MissingProductionEmailSender();
  }

  return new ConsoleEmailSender();
}
