"use client";

import { useEffect, useState, type RefObject } from "react";

// Both virtualized lead list surfaces anchor to the same scroll ancestor:
// the dashboard's .crm-main-scroll pane, falling back to the document
// element (e.g. tests render without DashboardLayout). scrollMargin is the
// list's offset within that ancestor.
//
// The rect formula is scroll-position-immune (the container's rect.top and
// the scroll element's rect.top shift together while scrolling), and the
// content above the lists is height-stable or absolutely positioned, so one
// measurement per list mount is enough; overscan absorbs small drift.
// listRendered keys the effect because the container only exists once the
// loading/empty states give way to the list itself.
export function useLeadListScrollAnchor<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  listRendered: boolean,
) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setScrollElement(null);
      return;
    }
    const scrollEl =
      (container.closest(".crm-main-scroll") as HTMLElement | null) ??
      document.documentElement;
    setScrollElement(scrollEl);
    setScrollMargin(
      container.getBoundingClientRect().top -
        scrollEl.getBoundingClientRect().top +
        scrollEl.scrollTop,
    );
  }, [containerRef, listRendered]);

  return { scrollElement, scrollMargin };
}
