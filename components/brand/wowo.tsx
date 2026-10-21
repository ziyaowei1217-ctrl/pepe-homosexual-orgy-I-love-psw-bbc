import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 窝窝, the psw mascot (the design system's `Wowo`), drawn on the logo's 120 grid.
 * Moods answer what just happened: `happy` success, `curious` no results, `sorry` an error, `sleepy` an empty list.
 * Purple on light surfaces, `white` on 葡萄紫 or 夜墨. Below 40px it keeps only its eyes. One 窝窝 per screen.
 */
export type WowoMood = "default" | "happy" | "curious" | "sorry" | "sleepy";

const PURPLE = "#6C4DFF";
const INK = "#1D1640";
const WHITE = "#FFFFFF";
const BLUSH = "#FF8F7A";

export function Wowo({ mood = "default", size = 96, tone = "purple", title, className }: {
  mood?: WowoMood; size?: number; tone?: "purple" | "white"; title?: string; className?: string;
}) {
  const onWhite = tone === "white";
  const body = onWhite ? WHITE : PURPLE;
  const line = onWhite ? INK : WHITE;
  const stroke = { fill: "none", stroke: line, strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const thin = { ...stroke, strokeWidth: 3 };
  const cheeks = <><ellipse cx="40" cy="78" rx="5" ry="3" fill={BLUSH} /><ellipse cx="80" cy="78" rx="5" ry="3" fill={BLUSH} /></>;
  const eyes = (dx: number, dy: number) => onWhite
    ? <><circle cx={49 + dx * 0.6} cy={66 + dy * 0.6} r="4.5" fill={INK} /><circle cx={71 + dx * 0.6} cy={66 + dy * 0.6} r="4.5" fill={INK} /></>
    : <><circle cx="49" cy="66" r="6" fill={WHITE} /><circle cx="71" cy="66" r="6" fill={WHITE} /><circle cx={49 + dx} cy={66 + dy} r="3.2" fill={INK} /><circle cx={71 + dx} cy={66 + dy} r="3.2" fill={INK} /></>;

  let face: ReactNode;
  if (size <= 40) {
    const eye = onWhite ? INK : WHITE;
    face = <><circle cx="49" cy="66" r="7" fill={eye} /><circle cx="71" cy="66" r="7" fill={eye} /></>;
  } else if (mood === "happy") {
    face = <><path d="M44 68 Q49 61 54 68" {...stroke} /><path d="M66 68 Q71 61 76 68" {...stroke} />{cheeks}<path d="M52 76 Q60 88 68 76 Z" fill={line} /></>;
  } else if (mood === "curious") {
    face = <>{eyes(2.4, -1.4)}{cheeks}<circle cx="61" cy="80" r="2.8" {...thin} /></>;
  } else if (mood === "sorry") {
    face = <>{eyes(0, 2.3)}<path d="M42 58.5 L52 56" {...thin} /><path d="M78 58.5 L68 56" {...thin} />{cheeks}<path d="M53 82 Q60 76.5 67 82" {...stroke} /></>;
  } else if (mood === "sleepy") {
    face = <><path d="M44 66 Q49 70.5 54 66" {...stroke} /><path d="M66 66 Q71 70.5 76 66" {...stroke} />{cheeks}<path d="M57 79.5 Q60 81.5 63 79.5" {...thin} /><path d="M22 22h8l-8 9h8M27 37h6l-6 7h6" fill="none" stroke={body} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></>;
  } else {
    face = <>{onWhite ? eyes(0, 0) : eyes(1, 1)}{cheeks}<path d="M53 78 Q60 85 67 78" {...stroke} /></>;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="20 20 80 80"
      className={cn("shrink-0", className)}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      <polygon points="34,90 34,56 60,32 86,56 86,90" fill={body} stroke={body} strokeWidth="16" strokeLinejoin="round" />
      <rect x="71" y="22" width="10" height="24" rx="3" fill={body} />
      {face}
    </svg>
  );
}
