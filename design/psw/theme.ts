/**
 * Bridge from the psw design system to Tailwind.
 *
 * `tokens.json` is copied verbatim from the psw 设计系统 (Design System artifact). Do not edit it by hand:
 * when the design system changes, copy its `project/tokens.json` here again and every class picks it up.
 *
 * The design system's rule: screens use semantic colours only (`bg`, `ink`, `primary-text` …); the raw scales
 * (`purple-500`, `lime-200` …) are for illustrations, covers and defining new semantic colours.
 */
import tokens from "./tokens.json";

type ThemeId = "light" | "dark";
type TokenValue = string | { light: string; dark: string };
type Token = { name: string; value: TokenValue };

const colorTokens = new Map((tokens.color.tokens as Token[]).map((token) => [token.name, token.value]));

function resolve(value: TokenValue, theme: ThemeId, depth = 0): string {
  if (depth > 8) throw new Error("psw tokens: reference loop");
  const raw = typeof value === "string" ? value : value[theme];
  const reference = /^\{([a-z0-9-]+)\}$/.exec(raw);
  if (!reference) return raw;
  const target = colorTokens.get(reference[1]);
  if (target === undefined) throw new Error(`psw tokens: unknown colour ${reference[1]}`);
  return resolve(target, theme, depth + 1);
}

/** One colour from the design system, resolved for a theme. */
export function pswColor(name: string, theme: ThemeId = "light"): string {
  const value = colorTokens.get(name);
  if (value === undefined) throw new Error(`psw tokens: unknown colour ${name}`);
  return resolve(value, theme);
}

function scale(prefix: string) {
  return Object.fromEntries(
    [...colorTokens.keys()].filter((name) => name.startsWith(`${prefix}-`)).map((name) => [name.slice(prefix.length + 1), pswColor(name)])
  );
}

const c = (name: string) => pswColor(name);

/** Semantic colours, named exactly as in the design system (`text-ink-secondary`, `bg-primary-soft`, `bg-ink-block` …). */
export const pswColors = {
  surface: { DEFAULT: c("surface"), subtle: c("surface-subtle"), muted: c("surface-muted") },
  line: { DEFAULT: c("line"), strong: c("line-strong") },
  "control-border": c("control-border"),
  outline: c("outline"),
  ink: { DEFAULT: c("ink"), secondary: c("ink-secondary"), placeholder: c("ink-placeholder"), disabled: c("ink-disabled"), block: c("ink-block") },
  on: {
    dark: c("on-dark"),
    "dark-secondary": c("on-dark-secondary"),
    primary: c("on-primary"),
    "primary-soft": c("on-primary-soft"),
    "primary-soft-pressed": c("on-primary-soft-pressed"),
    accent: c("on-accent"),
    danger: c("on-danger"),
    badge: c("on-badge"),
    toast: c("on-toast"),
    "tag-shortstay": c("on-tag-shortstay")
  },
  primarySemantic: {
    hover: c("primary-hover"),
    pressed: c("primary-pressed"),
    soft: c("primary-soft"),
    "soft-hover": c("primary-soft-hover"),
    "soft-pressed": c("primary-soft-pressed"),
    text: c("primary-text")
  },
  accent: { DEFAULT: c("accent"), hover: c("accent-hover"), pressed: c("accent-pressed"), foreground: c("on-accent") },
  blush: c("blush"),
  "tag-shortstay": c("tag-shortstay"),
  "tag-neutral": c("tag-neutral"),
  "fill-disabled": c("fill-disabled"),
  success: { DEFAULT: c("success"), text: c("success-text"), soft: c("success-soft") },
  warning: { DEFAULT: c("warning"), text: c("warning-text"), soft: c("warning-soft") },
  danger: { DEFAULT: c("danger"), hover: c("danger-hover"), pressed: c("danger-pressed"), text: c("danger-text"), soft: c("danger-soft") },
  badge: c("badge"),
  toast: { bg: c("toast-bg"), success: c("toast-success"), danger: c("toast-danger"), action: c("toast-action") },
  focus: { ring: c("focus-ring"), gap: c("focus-gap") },
  scrim: c("scrim"),
  "photo-button": c("photo-button"),
  // Raw scales: illustrations, covers and new semantic colours only.
  purple: scale("purple"),
  lime: scale("lime"),
  peach: scale("peach"),
  neutral: scale("neutral")
} as const;

type ListToken = { name: string; value: TokenValue };
const list = (group: { tokens: ListToken[] }) => group.tokens;

/** `rounded-psw-sm` … `rounded-psw-2xl`; 全圆 stays Tailwind's `rounded-full`. */
export const pswRadii = Object.fromEntries(
  list(tokens.radius as { tokens: ListToken[] })
    .filter((token) => token.name !== "radius-full")
    .map((token) => [token.name.replace("radius-", "psw-"), token.value as string])
);

/** `shadow-card-hover`, `shadow-menu`, `shadow-dialog`, `shadow-focus` … (light theme values). */
export const pswShadows = Object.fromEntries(
  list(tokens.shadow as { tokens: ListToken[] }).map((token) => [
    token.name.replace("shadow-", ""),
    typeof token.value === "string" ? token.value : token.value.light
  ])
);
