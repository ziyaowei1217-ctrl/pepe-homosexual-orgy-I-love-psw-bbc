import { cn } from "@/lib/utils";

/**
 * psw lockup: 葡萄紫 窝窝 mark + custom "psw" wordmark (from the psw design system).
 * The wordmark uses currentColor so it follows the surrounding text colour (夜墨 on light, white on dark).
 * At header sizes the mark keeps only its eyes, as the design system asks below ~48px.
 */
export function PswLogo({ height = 34, className, title = "psw" }: { height?: number; className?: string; title?: string }) {
  const width = Math.round((height * 322) / 147);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 322 147"
      role="img"
      aria-label={title}
      className={cn("shrink-0 text-ink", className)}
    >
      <g transform="scale(1.5) translate(-20 -20)">
        <polygon points="34,90 34,56 60,32 86,56 86,90" fill="#6C4DFF" stroke="#6C4DFF" strokeWidth="16" strokeLinejoin="round" />
        <rect x="71" y="22" width="10" height="24" rx="3" fill="#6C4DFF" />
        <circle cx="49" cy="66" r="7" fill="#FFFFFF" />
        <circle cx="71" cy="66" r="7" fill="#FFFFFF" />
      </g>
      <g transform="translate(138 57)">
        <g fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5 V81.5" />
          <circle cx="30" cy="30" r="23.5" />
          <path d="M100 18.25 A11.75 11.75 0 1 0 88.25 30 A11.75 11.75 0 1 1 76.5 41.75" />
          <path d="M122 6.5 V40 A13.5 13.5 0 0 0 149 40 V6.5 M149 40 A13.5 13.5 0 0 0 176 40 V6.5" />
        </g>
      </g>
    </svg>
  );
}

/** The 窝窝 mark alone, for tight spots such as workspace sidebars. */
export function PswMark({ size = 36, className, title = "psw" }: { size?: number; className?: string; title?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title} className={cn("shrink-0", className)}>
      <rect width="120" height="120" rx="28" fill="#6C4DFF" />
      <g transform="translate(60 62) scale(0.84) translate(-60 -60)">
        <polygon points="34,90 34,56 60,32 86,56 86,90" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="16" strokeLinejoin="round" />
        <rect x="71" y="22" width="10" height="24" rx="3" fill="#FFFFFF" />
        <circle cx="49" cy="66" r="7" fill="#1D1640" />
        <circle cx="71" cy="66" r="7" fill="#1D1640" />
      </g>
    </svg>
  );
}
