import { cn } from "@/lib/utils";

/** Trusted, local vector artwork with no font or network dependency. */
export function PswLogo({
  className,
  variant = "full",
  inverse = false
}: {
  className?: string;
  variant?: "full" | "mark";
  inverse?: boolean;
}) {
  return (
    <svg
      viewBox={variant === "mark" ? "0 0 64 64" : "0 0 184 64"}
      fill="none"
      role="img"
      aria-label="psw — people spaces wellbeing"
      focusable="false"
      className={cn("h-10 w-auto shrink-0", inverse ? "text-white" : "text-brand", className)}
    >
      <g fill="currentColor">
        <circle cx="16" cy="13" r="4.5" />
        <circle cx="32" cy="9" r="4.5" />
        <circle cx="48" cy="13" r="4.5" />
      </g>
      <g stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 49V31a7 7 0 0 1 14 0v18" />
        <path d="M23 49V26a9 9 0 0 1 18 0v23" />
        <path d="M41 49V31a7 7 0 0 1 14 0v18" />
      </g>
      {variant === "full" ? <g stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M76 54V25m0 11a11 11 0 1 1 22 0 11 11 0 0 1-22 0Z" />
        <path d="M125 27c-4-4-16-4-16 3 0 8 18 4 18 12 0 7-13 8-19 3" />
        <path d="m137 25 6 22 10-19 10 19 6-22" />
      </g> : null}
    </svg>
  );
}
