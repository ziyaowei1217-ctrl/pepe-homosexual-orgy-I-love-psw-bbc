import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

export class CliValidationError extends Error {}

const allowedValidationMessages = new Set([
  "expected add, list, or revoke",
  "expected grant or revoke",
  "list accepts no options",
  "expected --email, --actor, and --reason options",
  "--email is required",
  "--actor is required",
  "--reason is required",
  "--actor and --reason are required",
  "--email must not be blank",
  "--actor must not be blank",
  "--reason must not be blank",
  "--email must be a valid email without whitespace",
  "--actor must be a valid email without whitespace"
]);

type CliDatabase = {
  $connect(): Promise<unknown>;
  $disconnect(): Promise<unknown>;
};

export async function runCliLifecycle<Command, Database extends CliDatabase, Operations>(options: {
  argv: string[];
  parse: (argv: string[]) => Command;
  createDatabase: () => Database;
  createOperations: (database: Database) => Operations;
  execute: (command: Command, operations: Operations, write: (line: string) => void) => Promise<void>;
  write: (line: string) => void;
  writeError: (line: string) => void;
  fallbackMessage: string;
}) {
  let database: Database | undefined;
  let failed = false;
  let failure: unknown;
  const output: string[] = [];

  try {
    const command = options.parse(options.argv);
    database = options.createDatabase();
    await database.$connect();
    const operations = options.createOperations(database);
    await options.execute(command, operations, (line) => output.push(line));
  } catch (error: unknown) {
    failed = true;
    failure = error;
  }

  if (database) {
    try {
      await database.$disconnect();
    } catch (error: unknown) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }

  if (failed) {
    options.writeError(formatCliFailure(failure, options.fallbackMessage));
    return 1;
  }
  output.forEach(options.write);
  return 0;
}

export function formatCliFailure(error: unknown, fallbackMessage: string) {
  if (error instanceof CliValidationError && allowedValidationMessages.has(error.message)) {
    return `INVALID_ARGUMENTS: ${error.message}`;
  }
  if (error instanceof BadRequestException) return "INVALID_INPUT: Command input is invalid";
  if (error instanceof NotFoundException) return "BETA_INVITE_NOT_FOUND: Beta invite not found";
  if (error instanceof ConflictException) {
    const response = error.getResponse();
    const code = typeof response === "object" && response !== null ? (response as { code?: unknown }).code : undefined;
    if (code === "USER_NOT_FOUND") return "USER_NOT_FOUND: User not found";
    if (code === "LAST_ADMIN_REQUIRED") {
      return "LAST_ADMIN_REQUIRED: At least one administrator is required";
    }
    if (code === "BETA_INVITE_ALREADY_CLAIMED") {
      return "BETA_INVITE_ALREADY_CLAIMED: Claimed beta invites cannot be revoked";
    }
  }
  return `COMMAND_FAILED: ${fallbackMessage}`;
}

export async function runCliEntrypoint(options: {
  runMain: () => Promise<number>;
  writeError: (line: string) => void;
  fallbackMessage: string;
}) {
  try {
    return await options.runMain();
  } catch {
    try {
      options.writeError(`COMMAND_FAILED: ${options.fallbackMessage}`);
    } catch {
      // A failed stderr stream must not surface the original exception.
    }
    return 1;
  }
}
