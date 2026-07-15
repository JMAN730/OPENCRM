import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBodyScrollLock } from "./useBodyScrollLock";

describe("useBodyScrollLock", () => {
  it("locks the body while mounted and restores it on unmount", () => {
    const { unmount } = renderHook(() => useBodyScrollLock());

    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the lock until the last stacked overlay unmounts", () => {
    const first = renderHook(() => useBodyScrollLock());
    const second = renderHook(() => useBodyScrollLock());

    first.unmount();
    expect(document.body.style.position).toBe("fixed");

    second.unmount();
    expect(document.body.style.position).toBe("");
  });

  it("does nothing while inactive and locks once activated", () => {
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) => useBodyScrollLock(active),
      { initialProps: { active: false } },
    );

    expect(document.body.style.position).toBe("");

    rerender({ active: true });
    expect(document.body.style.position).toBe("fixed");

    unmount();
    expect(document.body.style.position).toBe("");
  });
});
