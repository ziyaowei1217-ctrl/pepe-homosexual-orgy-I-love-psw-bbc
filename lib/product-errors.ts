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
  const mediaMessage = safeCode ? listingMediaMessages[safeCode] : undefined;

  if (mediaMessage) {
    return new ProductApiError({
      category: status >= 500 ? "service" : "validation",
      code: safeCode,
      message: mediaMessage,
      retryable: status >= 500 || safeCode === "LISTING_MEDIA_STATE_CONFLICT",
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

const listingMediaMessages: Record<string, string> = {
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
  IMAGE_STORAGE_UNAVAILABLE: "图片服务暂时不可用，请稍后重试。"
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
