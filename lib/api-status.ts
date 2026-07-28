export function getApiPresentationState(error: string | null) {
  if (!error) {
    return {
      mode: "online" as const,
      label: "服务已连接",
      detail: "数据由正式服务提供。"
    };
  }

  const networkFailure = /failed to fetch|networkerror|load failed|网络连接失败/i.test(error);

  return {
    mode: "error" as const,
    label: "服务暂时不可用",
    detail: networkFailure
      ? "暂时无法连接服务，请检查网络后重试。"
      : "操作未完成，请稍后重试。"
  };
}
