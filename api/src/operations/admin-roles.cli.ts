import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminRolesService, type RoleMutationInput } from "./admin-roles.service";

export type AdminRoleCommand = ({ action: "grant" } | { action: "revoke" }) & RoleMutationInput;
type AdminRoleOperations = Pick<AdminRolesService, "grant" | "revoke">;

function validationError(message: string): never {
  throw new Error(`Validation error: ${message}`);
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
  return { action, email: options["--email"], actorEmail: options["--actor"], reason: options["--reason"] };
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
    writeError(error instanceof Error ? error.message : "Administrator role command failed");
    return 1;
  }
}

async function main() {
  let command: AdminRoleCommand;
  try {
    command = parseAdminRoleCommand(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "Administrator role command failed");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    await runAdminRoleCommand(command, new AdminRolesService(prisma, new AuditService()), (line) => console.log(line));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "Administrator role command failed");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
