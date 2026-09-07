import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DemoPaymentsService } from '../src/demo-payments/demo-payments.service';

describe('demo payment transaction retry limits', () => {
  it('bounds persistent serialization conflicts and returns an actionable conflict', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('serialization failure', { code: 'P2034', clientVersion: 'test' });
    const transaction = vi.fn().mockRejectedValue(error);
    const service = new DemoPaymentsService({ $transaction: transaction } as never);
    await expect(service.confirmMoveIn('renter', 'fund', 'confirmation-retry-key')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not replay authorization or other non-serialization failures', async () => {
    const error = new NotFoundException('Held fund not found');
    const transaction = vi.fn().mockRejectedValue(error);
    const service = new DemoPaymentsService({ $transaction: transaction } as never);
    await expect(service.confirmMoveIn('stranger', 'fund', 'confirmation-other-key')).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
