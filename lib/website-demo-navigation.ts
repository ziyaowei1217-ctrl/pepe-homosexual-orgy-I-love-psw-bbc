import { canonicalWebsitePath } from "./website-static-path";

const notices = {
  inbox: { active: "inbox", title: "消息", status: "消息功能暂未开放", description: "这是消息页面的演示说明。演示版不连接真实聊天，也不会发送消息。" },
  account: { active: "account", title: "我的账户", status: "账户功能暂未开放", description: "这是账户页面的演示说明。演示版不提供登录或个人资料管理；收藏仅保存在此设备上。" },
  host: { active: "account", title: "房东中心", status: "房东发布暂未开放", description: "这是房东中心的演示说明。演示版不发布真实房源，也不接受上传。" },
  applications: { active: "account", title: "转租申请", status: "申请功能暂未开放", description: "这是申请页面的演示说明。演示版不会提交申请、建立租约或处理款项。" },
  roommates: { active: "roommates", title: "室友互动", status: "室友互动暂未开放", description: "这是室友互动页面的演示说明。演示版可以浏览虚构室友资料，但不会建立真实匹配或团队。" }
} as const;

export type WebsiteDemoSection = keyof typeof notices;

// Preserve destination identity without forwarding private IDs, queries or URLs.
// This context only selects fixed notice copy; it never opens a private service.
export function websiteDemoSectionForPath(pathname: string): WebsiteDemoSection | null {
  const canonical = canonicalWebsitePath(pathname);
  if (canonical === null) return null;
  const root = canonical.split("/")[1];
  if (root === "messages") return "inbox";
  if (root === "inbox" || root === "account" || root === "host" || root === "applications") return root;
  if (root === "trips" || canonical === "/listing/mine") return "account";
  if (canonical === "/roommates/likes" || canonical === "/roommates/teams") return "roommates";
  return null;
}

export function websiteDemoNotice(section: unknown) {
  if (typeof section === "string" && Object.hasOwn(notices, section)) return notices[section as WebsiteDemoSection];
  return { active: undefined, title: "这个演示仅供浏览", status: "真实服务暂未开放", description: "这是 psw 面向留学生的转租与接租演示。" } as const;
}
