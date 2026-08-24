"use client";

import { useEffect, useRef } from "react";

export function useWindowFocusRefresh(refresh: () => unknown) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleFocus = () => {
      try {
        void Promise.resolve(refreshRef.current()).catch(() => undefined);
      } catch {
        // The caller owns its visible error state; keep focus events from escaping.
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);
}
