import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The psw type scale (`text-m-footnote`, `text-d-subhead` …) is a font size. Plain tailwind-merge does not know these
// names and reads them as text colours, so `cn("text-m-footnote", "text-danger-text")` used to drop the size.
const isPswTypeStyle = (value: string) => /^(m|d)-[a-z]/.test(value);
const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: [isPswTypeStyle] }] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
