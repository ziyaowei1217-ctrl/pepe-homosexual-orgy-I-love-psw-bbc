// Which sign-in methods this build shows. Neon mode only; an unset value keeps
// the original Google-only screen. The API still decides what actually works.
export type AuthMethod = "google" | "github" | "email" | "phone";
const knownMethods: readonly AuthMethod[] = ["google", "github", "email", "phone"];

export function enabledAuthMethods(raw = process.env.NEXT_PUBLIC_AUTH_METHODS): AuthMethod[] {
  const methods = (raw ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const valid = methods.filter((entry): entry is AuthMethod => knownMethods.includes(entry as AuthMethod));
  const unique = [...new Set(valid)];
  return unique.some((entry) => entry !== "phone") ? unique : ["google"];
}

const methodNames: Record<AuthMethod, string> = { google: "Google", github: "GitHub", email: "邮箱验证码", phone: "手机号" };

// Guest copy for Neon mode, e.g. "使用 Google 账户登录" or "使用 Google、邮箱验证码或手机号登录".
export function signInViaPhrase(methods = enabledAuthMethods()) {
  if (methods.length === 1 && methods[0] === "google") return "使用 Google 账户登录";
  const names = methods.map((method) => methodNames[method]);
  const listed = names.length > 1 ? `${names.slice(0, -1).join("、")}或${names[names.length - 1]}` : names[0];
  // Latin names get a space on each side, as in "使用 Google 账户登录".
  return `使用${listed}登录`.replace(/([\u4e00-\u9fff])([A-Za-z])/g, "$1 $2").replace(/([A-Za-z])([\u4e00-\u9fff])/g, "$1 $2");
}
