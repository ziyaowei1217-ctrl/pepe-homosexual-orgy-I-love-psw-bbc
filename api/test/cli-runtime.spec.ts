import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { runCliLifecycle } from "../src/operations/cli-runtime";

describe("shared operations CLI lifecycle", () => {
  it.each(["parse", "database construction", "connect", "service construction", "execute", "disconnect"])(
    "treats an undefined rejection during %s as a sanitized failure",
    async (failurePhase) => {
      const writes: string[] = [];
      const errors: string[] = [];
      const database = {
        $connect: async () => {
          if (failurePhase === "connect") throw undefined;
        },
        $disconnect: async () => {
          if (failurePhase === "disconnect") throw undefined;
        }
      };

      const status = await runCliLifecycle({
        argv: ["list"],
        parse: () => {
          if (failurePhase === "parse") throw undefined;
          return { action: "list" };
        },
        createDatabase: () => {
          if (failurePhase === "database construction") throw undefined;
          return database;
        },
        createOperations: () => {
          if (failurePhase === "service construction") throw undefined;
          return {};
        },
        execute: async (_command, _operations, write) => {
          if (failurePhase === "execute") throw undefined;
          write("buffered-success");
        },
        write: (line) => writes.push(line),
        writeError: (line) => errors.push(line),
        fallbackMessage: "Operation failed"
      });

      expect(status).toBe(1);
      expect(writes).toEqual([]);
      expect(errors).toEqual(["COMMAND_FAILED: Operation failed"]);
    }
  );

  it("preserves a known primary failure when disconnect rejects with undefined", async () => {
    const errors: string[] = [];
    const status = await runCliLifecycle({
      argv: ["revoke"],
      parse: () => ({ action: "revoke" }),
      createDatabase: () => ({
        $connect: async () => undefined,
        $disconnect: async () => {
          throw undefined;
        }
      }),
      createOperations: () => ({}),
      execute: async () => {
        throw new NotFoundException("Beta invite not found");
      },
      write: () => undefined,
      writeError: (line) => errors.push(line),
      fallbackMessage: "Operation failed"
    });

    expect(status).toBe(1);
    expect(errors).toEqual(["BETA_INVITE_NOT_FOUND: Beta invite not found"]);
  });
});
