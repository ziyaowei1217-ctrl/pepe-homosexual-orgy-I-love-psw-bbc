import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  DemoLedgerAccount,
  DemoLedgerDirection,
  DemoLedgerEvent,
  type Prisma
} from "@prisma/client";

import { requireIdempotencyKey } from "../applications/application-idempotency";

type LedgerTransaction = Pick<Prisma.TransactionClient, "demoLedgerEntry">;

export type DemoLedgerPostInput = {
  paymentId: string;
  heldFundId: string;
  event: DemoLedgerEvent;
  amountCents: number;
  idempotencyKey: string;
};

const accountMappings: Record<DemoLedgerEvent, ReadonlyArray<{
  account: DemoLedgerAccount;
  direction: DemoLedgerDirection;
}>> = {
  HOLD: [
    { account: DemoLedgerAccount.RENTER_CLEARING, direction: DemoLedgerDirection.DEBIT },
    { account: DemoLedgerAccount.HELD_FUNDS, direction: DemoLedgerDirection.CREDIT }
  ],
  REFUND: [
    { account: DemoLedgerAccount.HELD_FUNDS, direction: DemoLedgerDirection.DEBIT },
    { account: DemoLedgerAccount.RENTER_CLEARING, direction: DemoLedgerDirection.CREDIT }
  ],
  RELEASE: [
    { account: DemoLedgerAccount.HELD_FUNDS, direction: DemoLedgerDirection.DEBIT },
    { account: DemoLedgerAccount.HOST_CLEARING, direction: DemoLedgerDirection.CREDIT }
  ]
};

export function accountsFor(event: DemoLedgerEvent) {
  return accountMappings[event].map((entry) => ({ ...entry }));
}

export async function postDemoLedgerPair(transaction: LedgerTransaction, input: DemoLedgerPostInput) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new BadRequestException("Demo ledger amount must be a positive integer");
  }
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const existing = await transaction.demoLedgerEntry.findMany({ where: { idempotencyKey } });
  if (existing.length > 0) return validateExistingPair(existing, { ...input, idempotencyKey });

  const transactionId = randomUUID();
  try {
    await transaction.demoLedgerEntry.createMany({
      data: accountsFor(input.event).map(({ account, direction }) => ({
        transactionId,
        paymentId: input.paymentId,
        heldFundId: input.heldFundId,
        event: input.event,
        account,
        direction,
        amountCents: input.amountCents,
        idempotencyKey
      }))
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }

  const posted = await transaction.demoLedgerEntry.findMany({ where: { idempotencyKey } });
  return validateExistingPair(posted, { ...input, idempotencyKey });
}

function validateExistingPair<T extends {
    paymentId: string;
    heldFundId: string;
    event: DemoLedgerEvent;
    account: DemoLedgerAccount;
    direction: DemoLedgerDirection;
    amountCents: number;
  }>(
  entries: T[],
  input: DemoLedgerPostInput
) {
  const expected = new Set(accountsFor(input.event).map((entry) => `${entry.account}:${entry.direction}`));
  const exact = entries.length === 2 && entries.every((entry) =>
    entry.paymentId === input.paymentId &&
    entry.heldFundId === input.heldFundId &&
    entry.event === input.event &&
    entry.amountCents === input.amountCents &&
    expected.delete(`${entry.account}:${entry.direction}`)
  ) && expected.size === 0;
  if (!exact) throw new ConflictException("Idempotency-Key is already bound to a different ledger event");
  return entries;
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
