import { describe, expect, it } from "vitest";

import { ProductApiError, toProductApiError } from "../lib/product-errors";

describe("product API errors", () => {
  it("maps browser network failures to a retryable Chinese message", () => {
    const error = toProductApiError(new TypeError("Failed to fetch"));

    expect(error).toBeInstanceOf(ProductApiError);
    expect(error).toMatchObject({
      category: "network",
      message: "网络连接失败，请检查网络后重试。",
      retryable: true
    });
    expect(error.message).not.toContain("Failed to fetch");
  });

  it.each([
    [401, "authentication", "登录状态已失效，请重新登录。", false],
    [403, "permission", "你没有权限执行此操作。", false],
    [422, "validation", "提交内容有误，请检查后重试。", false],
    [500, "service", "服务暂时不可用，请稍后重试。", true]
  ] as const)("maps HTTP %i without exposing raw server responses", (status, category, message, retryable) => {
    const error = toProductApiError({ status, rawMessage: "<html>internal stack</html>" });

    expect(error).toMatchObject({ status, category, message, retryable });
    expect(error.message).not.toContain("internal stack");
  });
});
