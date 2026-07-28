import { describe, expect, it } from "vitest";

import { getApiPresentationState } from "../lib/api-status";

describe("api presentation", () => {
  it("presents network failures as a service outage without a fake fallback", () => {
    expect(getApiPresentationState("Failed to fetch")).toEqual({
      mode: "error",
      label: "服务暂时不可用",
      detail: "暂时无法连接服务，请检查网络后重试。"
    });
  });

  it("keeps other server errors actionable", () => {
    expect(getApiPresentationState("Unauthorized")).toEqual({
      mode: "error",
      label: "服务暂时不可用",
      detail: "操作未完成，请稍后重试。"
    });
  });
});
