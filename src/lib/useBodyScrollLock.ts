"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;

/**
 * Locks page scrolling while a full-screen overlay (modal, drawer) is
 * mounted. Reference-counted so stacked overlays (e.g. a dialog opened from
 * inside the lead modal) keep the lock until the last one unmounts.
 *
 * Uses the position:fixed body technique because `overflow: hidden` alone
 * does not stop touch scrolling on iOS Safari.
 */
export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    lockCount += 1;
    if (lockCount === 1) {
      savedScrollY = window.scrollY;
      const { style } = document.body;
      style.position = "fixed";
      style.top = `-${savedScrollY}px`;
      style.left = "0";
      style.right = "0";
      style.width = "100%";
      style.overflow = "hidden";
    }
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        const { style } = document.body;
        style.position = "";
        style.top = "";
        style.left = "";
        style.right = "";
        style.width = "";
        style.overflow = "";
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}
