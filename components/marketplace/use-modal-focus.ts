"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useModalFocus(dialog: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const currentDialog = dialog.current;
    if (!currentDialog) return;
    const element: HTMLElement = currentDialog;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const previousTabIndex = element.getAttribute("tabindex");
    if (previousTabIndex === null) element.tabIndex = -1;
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]'))
      .filter((node) => node.tabIndex >= 0 && !node.matches(":disabled") && !node.closest('[hidden], [aria-hidden="true"], [inert]'));
    const focusFirst = () => (focusable()[0] ?? element).focus();
    document.body.style.overflow = "hidden";
    focusFirst();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0]; const last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
    }
    function containFocus(event: FocusEvent) {
      if (event.target instanceof Node && !element.contains(event.target)) focusFirst();
    }
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", containFocus);
      if (previousTabIndex === null) element.removeAttribute("tabindex");
      if (previous?.isConnected) previous.focus();
    };
  }, [dialog]);
}
