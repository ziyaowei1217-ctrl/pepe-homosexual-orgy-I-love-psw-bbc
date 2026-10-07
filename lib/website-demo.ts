import { ProductApiError } from "./product-errors";
import { canonicalWebsitePath, WEBSITE_PUBLIC_ARTWORK_PATHS } from "./website-static-path";

// A separate, opt-in website build. The reviewed backend and normal production
// website never enable this flag. It is public configuration, not a credential.
export function isWebsiteDemo() {
  return process.env.NEXT_PUBLIC_WEBSITE_DEMO === "true";
}

export function websiteDemoUnavailableError() {
  return new ProductApiError({
    category: "permission",
    code: "WEBSITE_DEMO_READ_ONLY",
    status: 403,
    retryable: false,
    message: "演示版仅供浏览，不提供登录、申请、聊天、上传或付款。"
  });
}

export function canBrowseWebsiteDemo(pathname: string) {
  const canonical = canonicalWebsitePath(pathname);
  if (canonical === null) return false;
  pathname = canonical;
  // Public, inert identity exports only. Other files and directories stay isolated.
  if (WEBSITE_PUBLIC_ARTWORK_PATHS.some(path => path === pathname)) return true;
  if (["/", "/search", "/saved", "/roommates", "/demo", "/api/health"].includes(pathname)) return true;
  if (/^\/listing\/(?!mine$)[^/]+$/.test(pathname)) return true;
  return /^\/roommates\/(?!likes$|teams$)[^/]+$/.test(pathname);
}
