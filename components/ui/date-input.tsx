"use client";

import { forwardRef, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent } from "react";

import { formatDateLong } from "@/lib/date-format";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "placeholder"> & {
  value?: string;
  defaultValue?: string;
  /** Shown while no date is chosen, in the placeholder colour like any other empty field. */
  placeholder?: string;
  /** Classes for the visible date text: the caller keeps the look its field already had. */
  className?: string;
  /** Classes for the wrapper, e.g. to make it fill a grid cell. */
  wrapperClassName?: string;
  /**
   * Draw the design system's focus ring (shadow-focus) on the visible box. Turn it off when the surrounding box
   * carries the ring instead (a `field-shell` label around the date).
   */
  focusOutline?: boolean;
};

/**
 * psw DateInput: the browser's own date picker underneath, the site's date format on top.
 *
 * A native date field shows the date the way the browser's locale does (「2026/11/01」, 「11/01/2026」, or blank
 * segments 「年 /月/日」 before a choice), so every field looked different from the rest of the site, which writes
 * 「11月1日」. Here the native input is kept for its picker, keyboard and screen-reader behaviour, but made transparent and
 * laid over a line of text in the site's format. Clicking anywhere on the field opens the picker.
 */
export const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput(
  { value, defaultValue, placeholder = "选择日期", className, wrapperClassName, focusOutline = true, onChange, onClick, onKeyDown, disabled, ...input },
  ref
) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const shown = value ?? own;

  function change(event: ChangeEvent<HTMLInputElement>) {
    if (value === undefined) setOwn(event.target.value);
    onChange?.(event);
  }

  function open(event: MouseEvent<HTMLInputElement>) {
    onClick?.(event);
    if (!event.defaultPrevented) showPicker(event.currentTarget);
  }

  function key(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    // Enter and Space open the picker; arrow keys still step the date as in any date field.
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showPicker(event.currentTarget); }
  }

  return <span className={cn("relative block min-w-0", wrapperClassName)}>
    <input
      {...input}
      ref={ref}
      type="date"
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      disabled={disabled}
      onChange={change}
      onClick={open}
      onKeyDown={key}
      className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none text-base opacity-0 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
    />
    <span aria-hidden="true" className={cn("block truncate", focusOutline && "peer-focus-visible:shadow-focus", className, !shown && "text-ink-placeholder", disabled && "opacity-50")}>
      {shown ? formatDateLong(shown) : placeholder}
    </span>
  </span>;
});

function showPicker(input: HTMLInputElement) {
  // Not every browser has showPicker, and it throws without a user gesture or inside some frames; the field then
  // behaves like a plain date input.
  try { input.showPicker?.(); } catch { /* keep the native behaviour */ }
}
