import { describe, expect, it } from "vitest";

import { getApiPresentationState } from "../lib/api-status";

describe("api presentation", () => {
  it("presents network failures as intentional local demo mode", () => {
    expect(getApiPresentationState("Failed to fetch")).toEqual({
      mode: "demo",
      label: "本地 Demo 模式",
      detail: "浏览与本地流程可继续使用；登录、发布和云端同步需要 API。"
    });
  });

  it("keeps other server errors actionable", () => {
    expect(getApiPresentationState("Unauthorized")).toMatchObject({ mode: "error", label: "API 同步异常" });
  });
});
