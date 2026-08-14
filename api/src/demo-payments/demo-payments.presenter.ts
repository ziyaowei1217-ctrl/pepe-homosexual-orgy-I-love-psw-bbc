export const DEMO_PAYMENT_DISCLAIMER = "演示模式，不会真实扣款";

export function presentDemoPaymentState<T extends object>(state: T) {
  return { disclaimer: DEMO_PAYMENT_DISCLAIMER, ...state };
}
