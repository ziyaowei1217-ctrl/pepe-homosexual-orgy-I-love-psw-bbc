import { describe, expect, it } from 'vitest';
import { canConfirmDemoMoveIn } from '../lib/demo-payments';

describe('demo move-in business dates', () => {
  it.each([
    ['2099-09-20', '2099-09-20T06:59:59.999Z', false],
    ['2099-09-20T00:00:00.000Z', '2099-09-20T07:00:00.000Z', true],
    ['2099-01-20', '2099-01-20T07:59:59.999Z', false],
    ['2099-01-20T00:00:00.000Z', '2099-01-20T08:00:00.000Z', true]
  ])('compares %s at %s to the LA calendar date', (moveIn, instant, expected) => {
    expect(canConfirmDemoMoveIn(moveIn, Date.parse(instant))).toBe(expected);
  });
  it('keeps malformed or impossible dates ineligible', () => {
    for (const moveIn of ['', 'invalid', '2099-02-30']) {
      expect(canConfirmDemoMoveIn(moveIn, Date.parse('2099-03-01T12:00:00Z'))).toBe(false);
    }
  });
});
