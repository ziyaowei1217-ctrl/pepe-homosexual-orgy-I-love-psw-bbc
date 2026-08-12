import { afterEach, describe, expect, it, vi } from "vitest";

import { apiPost } from "../lib/api";
import {
  ProductApiError,
  productErrorForStatus,
  toProductApiError
} from "../lib/product-errors";

describe("product API errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("retains a parsed administrator reauthentication code without exposing the raw response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ADMIN_REAUTH_REQUIRED",
            message: "raw server detail"
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const error = await apiPost("/administrator-write", {}).catch(
      (requestError) => requestError
    );

    expect(error).toMatchObject({
      category: "permission",
      code: "ADMIN_REAUTH_REQUIRED",
      message: "需要再次验证管理员邮箱。",
      retryable: false,
      status: 403
    });
    expect(JSON.stringify(error)).not.toContain("raw server detail");
  });

  it("does not retain an unsafe backend error code", () => {
    const rawCode = "raw server detail <script>";
    const error = productErrorForStatus(403, rawCode);

    expect(error.code).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(rawCode);
  });
});
