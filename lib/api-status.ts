export function getApiPresentationState(error: string | null) {
  if (!error || /failed to fetch|networkerror|load failed/i.test(error)) {
    return {
      mode: "demo" as const,
      label: "本地 Demo 模式",
      detail: "浏览与本地流程可继续使用；登录、发布和云端同步需要 API。"
    };
  }

  return {
    mode: "error" as const,
    label: "API 同步异常",
    detail: error
  };
}
