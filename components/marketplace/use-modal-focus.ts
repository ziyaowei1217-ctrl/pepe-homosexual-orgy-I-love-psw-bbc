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
    const visible = (node: HTMLElement) => {
      const visibility = window.getComputedStyle(node).visibility;
      if (visibility === "hidden" || visibility === "collapse") return false;
      for (let ancestor: HTMLElement | null = node; ancestor && element.contains(ancestor); ancestor = ancestor.parentElement) {
        const style = window.getComputedStyle(ancestor);
        if (style.display === "none" || style.contentVisibility === "hidden") return false;
      }
      return true;
    };
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]'))
      .filter((node) => node.tabIndex >= 0 && !node.matches(":disabled") && !node.closest('[hidden], [aria-hidden="true"], [inert]') && visible(node))
      .sort((left, right) => {
        if (left.tabIndex === right.tabIndex) return 0;
        if (left.tabIndex === 0) return 1;
        if (right.tabIndex === 0) return -1;
        return left.tabIndex - right.tabIndex;
      });
    const focusFirst = () => (focusable()[0] ?? element).focus();
    document.body.style.overflow = "hidden";
    focusFirst();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      // Safari can skip buttons according to its keyboard preferences; step within the dialog explicitly.
      event.preventDefault();
      const elements = focusable();
      if (!elements.length) { element.focus(); return; }
      const index = elements.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? elements.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
      elements[next].focus();
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
