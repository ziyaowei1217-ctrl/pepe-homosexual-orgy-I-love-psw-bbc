import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { BetaInvitesService, type InviteMutationInput } from "./beta-invites.service";

export type BetaInviteCommand =
  | { action: "list" }
  | ({ action: "add" } & InviteMutationInput)
  | ({ action: "revoke" } & InviteMutationInput);

function validationError(message: string): never {
  throw new Error(`Validation error: ${message}`);
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
  return { action, email: options["--email"], actorEmail: options["--actor"], reason: options["--reason"] };
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

async function main() {
  const command = parseBetaInviteCommand(process.argv.slice(2));
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    await runBetaInviteCommand(command, new BetaInvitesService(prisma, new AuditService()), (line) => console.log(line));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Invitation command failed");
    process.exitCode = 1;
  });
}
