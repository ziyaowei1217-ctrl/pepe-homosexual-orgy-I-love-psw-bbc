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
  const productMessage = safeCode ? productCodeMessages[safeCode] : undefined;

  if (productMessage) {
    return new ProductApiError({
      category: status >= 500 || status === 429 ? "service" : status === 403 ? "permission" : "validation",
      code: safeCode,
      message: productMessage,
      retryable: status >= 500 || status === 429 || safeCode === "LISTING_MEDIA_STATE_CONFLICT",
      status
    });
  }

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
        message: "需要完成独立双重验证。",
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

const productCodeMessages: Record<string, string> = {
  AUTH_RECENT_LOGIN_REQUIRED: "为保护账户，请重新登录邮箱后再继续。",
  MFA_REQUIRED: "请先在账户的身份与认证页面启用双重验证。",
  MFA_VERIFICATION_REQUIRED: "请先在账户的身份与认证页面验证敏感操作，再返回重试。",
  MFA_INVALID_CODE: "验证码或恢复码无效。请检查后重试；已使用的恢复码不能重复使用。",
  MFA_ALREADY_ENABLED: "双重验证已经启用，请刷新状态。",
  MFA_ENROLLMENT_REQUIRED: "设置已过期，请重新绑定验证器。",
  MFA_RATE_LIMITED: "验证尝试过于频繁，请稍后再试。",
  LISTING_MEDIA_LIMIT_REACHED: "每套房源最多上传 12 张图片。",
  LISTING_MEDIA_LOCKED: "房源提交审核后，图片已锁定。",
  LISTING_MEDIA_STATE_CONFLICT: "图片状态已变化，请刷新后重试。",
  LISTING_MEDIA_INPUT_INVALID: "图片信息有误，请重新选择文件。",
  LISTING_MEDIA_ORDER_INVALID: "图片排序已变化，请刷新后重试。",
  IMAGE_TYPE_UNSUPPORTED: "仅支持 JPEG、PNG 或 WebP 图片。",
  IMAGE_TOO_LARGE: "单张图片不能超过 10 MB。",
  IMAGE_SIZE_MISMATCH: "图片大小校验失败，请重新上传。",
  IMAGE_CHECKSUM_MISMATCH: "图片完整性校验失败，请重新上传。",
  IMAGE_DIMENSIONS_UNSAFE: "图片尺寸无法安全读取，请更换图片。",
  IMAGE_VALIDATION_FAILED: "图片安全校验失败，请更换图片。",
  IMAGE_STORAGE_UNAVAILABLE: "图片服务暂时不可用，请稍后重试。",
  DEMO_MOVE_IN_NOT_STARTED: "约定入住日期前不能确认入住。"
};

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
