import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminRolesService, type RoleMutationInput } from "./admin-roles.service";
import { CliValidationError, formatCliFailure, runCliEntrypoint, runCliLifecycle } from "./cli-runtime";
import { requireOperationsEmail } from "./operations-input";

export type AdminRoleCommand = ({ action: "grant" } | { action: "revoke" }) & RoleMutationInput;
type AdminRoleOperations = Pick<AdminRolesService, "grant" | "revoke">;

function validationError(message: string): never {
  throw new CliValidationError(message);
}

export function parseAdminRoleCommand(argv: string[]): AdminRoleCommand {
  const [action, ...args] = argv;
  if (action !== "grant" && action !== "revoke") {
    return validationError("expected grant or revoke");
  }

  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined || !["--email", "--actor", "--reason"].includes(flag) || options[flag]) {
      return validationError("expected --email, --actor, and --reason options");
    }
    options[flag] = value;
  }
  if (options["--email"] === undefined) return validationError("--email is required");
  if (options["--actor"] === undefined) return validationError("--actor is required");
  if (options["--reason"] === undefined) return validationError("--reason is required");
  if (!options["--email"].trim()) return validationError("--email must not be blank");
  if (!options["--actor"].trim()) return validationError("--actor must not be blank");
  if (!options["--reason"].trim()) return validationError("--reason must not be blank");
  const email = parseOperationsEmail(options["--email"], "Target", "--email");
  const actorEmail = parseOperationsEmail(options["--actor"], "Operator", "--actor");
  return { action, email, actorEmail, reason: options["--reason"] };
}

export async function runAdminRoleCommand(
  command: AdminRoleCommand,
  service: AdminRoleOperations,
  write: (line: string) => void
) {
  const result = command.action === "grant" ? await service.grant(command) : await service.revoke(command);
  write(JSON.stringify(result));
}

export async function runAdminRoleCli(
  argv: string[],
  service: AdminRoleOperations,
  write: (line: string) => void,
  writeError: (line: string) => void
) {
  try {
    await runAdminRoleCommand(parseAdminRoleCommand(argv), service, write);
    return 0;
  } catch (error: unknown) {
    writeError(formatCliFailure(error, "Administrator role command failed"));
    return 1;
  }
}

type AdminRoleMainOptions = {
  argv: string[];
  createPrisma: () => PrismaService;
  createService: (prisma: PrismaService) => AdminRoleOperations;
  write: (line: string) => void;
  writeError: (line: string) => void;
};

export function runAdminRoleMain(options: Partial<AdminRoleMainOptions> = {}) {
  const resolved: AdminRoleMainOptions = {
    argv: process.argv.slice(2),
    createPrisma: () => new PrismaService(),
    createService: (prisma) => new AdminRolesService(prisma, new AuditService()),
    write: (line) => console.log(line),
    writeError: (line) => console.error(line),
    ...options
  };
  return runCliLifecycle({
    argv: resolved.argv,
    parse: parseAdminRoleCommand,
    createDatabase: resolved.createPrisma,
    createOperations: resolved.createService,
    execute: runAdminRoleCommand,
    write: resolved.write,
    writeError: resolved.writeError,
    fallbackMessage: "Administrator role command failed"
  });
}

export function runAdminRoleEntrypoint(options: {
  runMain?: () => Promise<number>;
  writeError?: (line: string) => void;
} = {}) {
  return runCliEntrypoint({
    runMain: options.runMain ?? (() => runAdminRoleMain()),
    writeError: options.writeError ?? ((line) => console.error(line)),
    fallbackMessage: "Administrator role command failed"
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
  void runAdminRoleEntrypoint().then((status) => {
    process.exitCode = status;
  });
}
