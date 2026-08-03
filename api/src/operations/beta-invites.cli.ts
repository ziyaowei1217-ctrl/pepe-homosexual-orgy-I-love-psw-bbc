import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { BetaInvitesService, type InviteMutationInput } from "./beta-invites.service";
import { CliValidationError, formatCliFailure, runCliEntrypoint, runCliLifecycle } from "./cli-runtime";
import { requireOperationsEmail } from "./operations-input";

export type BetaInviteCommand =
  | { action: "list" }
  | ({ action: "add" } & InviteMutationInput)
  | ({ action: "revoke" } & InviteMutationInput);

function validationError(message: string): never {
  throw new CliValidationError(message);
}

export function parseBetaInviteCommand(argv: string[]): BetaInviteCommand {
  const [action, ...args] = argv;
  if (action !== "add" && action !== "list" && action !== "revoke") {
    return validationError("expected add, list, or revoke");
  }
  if (action === "list") {
    if (args.length) return validationError("list accepts no options");
    return { action };
  }

  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value || !["--email", "--actor", "--reason"].includes(flag) || options[flag]) {
      return validationError("expected --email, --actor, and --reason options");
    }
    options[flag] = value;
  }
  if (!options["--email"]) return validationError("--email is required");
  if (!options["--actor"] || !options["--reason"]) return validationError("--actor and --reason are required");
  if (!options["--actor"].trim()) return validationError("--actor must not be blank");
  const email = parseOperationsEmail(options["--email"], "Target", "--email");
  const actorEmail = parseOperationsEmail(options["--actor"], "Operator", "--actor");
  return { action, email, actorEmail, reason: options["--reason"] };
}

export async function runBetaInviteCommand(
  command: BetaInviteCommand,
  service: Pick<BetaInvitesService, "add" | "list" | "revoke">,
  write: (line: string) => void
) {
  const result =
    command.action === "list"
      ? await service.list()
      : command.action === "add"
        ? await service.add(command)
        : await service.revoke(command);
  write(JSON.stringify(result));
}

export async function runBetaInviteCli(
  argv: string[],
  service: Pick<BetaInvitesService, "add" | "list" | "revoke">,
  write: (line: string) => void,
  writeError: (line: string) => void
) {
  try {
    await runBetaInviteCommand(parseBetaInviteCommand(argv), service, write);
    return 0;
  } catch (error: unknown) {
    writeError(formatCliFailure(error, "Invitation command failed"));
    return 1;
  }
}

type BetaInviteMainOptions = {
  argv: string[];
  createPrisma: () => PrismaService;
  createService: (prisma: PrismaService) => Pick<BetaInvitesService, "add" | "list" | "revoke">;
  write: (line: string) => void;
  writeError: (line: string) => void;
};

export function runBetaInviteMain(options: Partial<BetaInviteMainOptions> = {}) {
  const resolved: BetaInviteMainOptions = {
    argv: process.argv.slice(2),
    createPrisma: () => new PrismaService(),
    createService: (prisma) => new BetaInvitesService(prisma, new AuditService()),
    write: (line) => console.log(line),
    writeError: (line) => console.error(line),
    ...options
  };
  return runCliLifecycle({
    argv: resolved.argv,
    parse: parseBetaInviteCommand,
    createDatabase: resolved.createPrisma,
    createOperations: resolved.createService,
    execute: runBetaInviteCommand,
    write: resolved.write,
    writeError: resolved.writeError,
    fallbackMessage: "Invitation command failed"
  });
}

export function runBetaInviteEntrypoint(options: {
  runMain?: () => Promise<number>;
  writeError?: (line: string) => void;
} = {}) {
  return runCliEntrypoint({
    runMain: options.runMain ?? (() => runBetaInviteMain()),
    writeError: options.writeError ?? ((line) => console.error(line)),
    fallbackMessage: "Invitation command failed"
  });
}

function parseOperationsEmail(input: string, field: "Target" | "Operator", flag: "--email" | "--actor") {
  try {
    return requireOperationsEmail(input, field);
  } catch {
    return validationError(`${flag} must be a valid email without whitespace`);
  }
}

if (require.main === module) {
  void runBetaInviteEntrypoint().then((status) => {
    process.exitCode = status;
  });
}
