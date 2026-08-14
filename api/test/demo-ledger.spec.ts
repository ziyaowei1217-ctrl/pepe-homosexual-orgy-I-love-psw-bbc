import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { accountsFor, postDemoLedgerPair } from "../src/demo-payments/demo-ledger";

describe("demo double-entry ledger", () => {
  it("uses exact balanced account mappings", () => {
    expect(accountsFor("HOLD")).toEqual([
      { account: "RENTER_CLEARING", direction: "DEBIT" },
      { account: "HELD_FUNDS", direction: "CREDIT" }
    ]);
    expect(accountsFor("REFUND")).toEqual([
      { account: "HELD_FUNDS", direction: "DEBIT" },
      { account: "RENTER_CLEARING", direction: "CREDIT" }
    ]);
    expect(accountsFor("RELEASE")).toEqual([
      { account: "HELD_FUNDS", direction: "DEBIT" },
      { account: "HOST_CLEARING", direction: "CREDIT" }
    ]);
  });

  it("posts two equal lines and returns them unchanged on an exact retry", async () => {
    const ledger = createLedgerTransaction();
    const input = {
      paymentId: "payment-1",
      heldFundId: "fund-1",
      event: "HOLD" as const,
      amountCents: 185000,
      idempotencyKey: "hold-key-0001"
    };

    const first = await postDemoLedgerPair(ledger as never, input);
    const retry = await postDemoLedgerPair(ledger as never, input);

    expect(first).toHaveLength(2);
    expect(retry).toEqual(first);
    expect(ledger.rows).toHaveLength(2);
    expect(new Set(first.map((entry) => entry.transactionId))).toHaveLength(1);
    expect(first.map((entry) => entry.amountCents)).toEqual([185000, 185000]);
  });

  it("rejects invalid amounts and conflicting reuse of a ledger key", async () => {
    const ledger = createLedgerTransaction();
    await expect(postDemoLedgerPair(ledger as never, {
      paymentId: "payment-1",
      heldFundId: "fund-1",
      event: "HOLD",
      amountCents: 0,
      idempotencyKey: "hold-key-0001"
    })).rejects.toBeInstanceOf(BadRequestException);
    await postDemoLedgerPair(ledger as never, {
      paymentId: "payment-1",
      heldFundId: "fund-1",
      event: "HOLD",
      amountCents: 185000,
      idempotencyKey: "hold-key-0001"
    });
    await expect(postDemoLedgerPair(ledger as never, {
      paymentId: "payment-1",
      heldFundId: "fund-1",
      event: "REFUND",
      amountCents: 185000,
      idempotencyKey: "hold-key-0001"
    })).rejects.toBeInstanceOf(ConflictException);
  });
});

function createLedgerTransaction() {
  const rows: Array<Record<string, any>> = [];
  return {
    rows,
    demoLedgerEntry: {
      findMany: async ({ where }: { where: { idempotencyKey: string } }) =>
        rows.filter((entry) => entry.idempotencyKey === where.idempotencyKey),
      createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
        rows.push(...data.map((entry, index) => ({ id: `ledger-${rows.length + index + 1}`, createdAt: new Date(), ...entry })));
        return { count: data.length };
      }
    }
  };
}
