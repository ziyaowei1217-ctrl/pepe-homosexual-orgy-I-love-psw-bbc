export type ProductApiErrorCategory =
  | "network"
  | "authentication"
  | "validation"
  | "permission"
  | "service";

export class ProductApiError extends Error {
  readonly category: ProductApiErrorCategory;
  readonly code?: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(input: {
    category: ProductApiErrorCategory;
    code?: string;
    message: string;
    retryable: boolean;
    status?: number;
  }) {
    super(input.message);
    this.name = "ProductApiError";
    this.category = input.category;
    this.code = input.code;
    this.retryable = input.retryable;
    this.status = input.status;
  }
}

type HttpLikeError = {
  code?: string;
  status: number;
  rawMessage?: string;
};

export function toProductApiError(error: unknown): ProductApiError {
  if (error instanceof ProductApiError) return error;

  if (isHttpLikeError(error)) {
    return productErrorForStatus(error.status, error.code);
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      /failed to fetch|networkerror|network request failed|load failed/i.test(error.message))
  ) {
    return new ProductApiError({
      category: "network",
      message: "网络连接失败，请检查网络后重试。",
      retryable: true
    });
  }

  return new ProductApiError({
    category: "service",
    message: "操作未完成，请稍后重试。",
    retryable: true
  });
}

export function productErrorForStatus(status: number, code?: unknown): ProductApiError {
  const safeCode = safeErrorCode(code);

  if (status === 401) {
    return new ProductApiError({
      category: "authentication",
      message: "登录状态已失效，请重新登录。",
      retryable: false,
      status
    });
  }

  if (status === 403) {
    if (safeCode === "ADMIN_REAUTH_REQUIRED") {
      return new ProductApiError({
        category: "permission",
        code: safeCode,
        message: "需要再次验证管理员邮箱。",
        retryable: false,
        status
      });
    }
    return new ProductApiError({
      category: "permission",
      code: safeCode,
      message: "你没有权限执行此操作。",
      retryable: false,
      status
    });
  }

  if (status === 400 || status === 409 || status === 422) {
    return new ProductApiError({
      category: "validation",
      message: "提交内容有误，请检查后重试。",
      retryable: false,
      status
    });
  }

  return new ProductApiError({
    category: "service",
    message: "服务暂时不可用，请稍后重试。",
    retryable: status >= 500 || status === 408 || status === 429,
    status
  });
}

function safeErrorCode(code: unknown) {
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code)
    ? code
    : undefined;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  );
}
