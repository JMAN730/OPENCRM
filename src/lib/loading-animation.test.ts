import { describe, expect, it, vi } from "vitest";
import {
  LOADING_ANIMATION_LAST_SHOWN_KEY,
  LOADING_ANIMATION_MODE_KEY,
  getLocalDateKey,
  readLoadingAnimationMode,
  recordLoadingAnimationShown,
  shouldShowLoadingAnimation,
  writeLoadingAnimationMode,
} from "./loading-animation";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("loading animation browser policy", () => {
  const today = new Date(2026, 4, 31, 12);
  const tomorrow = new Date(2026, 5, 1, 12);

  it("defaults malformed or missing modes to ALWAYS", () => {
    expect(readLoadingAnimationMode(createStorage())).toBe("ALWAYS");
    expect(readLoadingAnimationMode(createStorage({ [LOADING_ANIMATION_MODE_KEY]: "sometimes" }))).toBe("ALWAYS");
  });

  it("persists a selected mode", () => {
    const storage = createStorage();
    writeLoadingAnimationMode(storage, "OFF");
    expect(storage.setItem).toHaveBeenCalledWith(LOADING_ANIMATION_MODE_KEY, "OFF");
  });

  it("always shows in ALWAYS mode and never shows in OFF mode", () => {
    expect(shouldShowLoadingAnimation(createStorage(), "ALWAYS", today)).toBe(true);
    expect(shouldShowLoadingAnimation(createStorage(), "OFF", today)).toBe(false);
  });

  it("shows ONCE_DAILY once per local calendar date", () => {
    const storage = createStorage();

    expect(shouldShowLoadingAnimation(storage, "ONCE_DAILY", today)).toBe(true);
    recordLoadingAnimationShown(storage, "ONCE_DAILY", today);

    expect(storage.setItem).toHaveBeenCalledWith(LOADING_ANIMATION_LAST_SHOWN_KEY, getLocalDateKey(today));
    expect(shouldShowLoadingAnimation(storage, "ONCE_DAILY", today)).toBe(false);
    expect(shouldShowLoadingAnimation(storage, "ONCE_DAILY", tomorrow)).toBe(true);
  });

  it("fails open when storage is unavailable", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("blocked"); }),
      setItem: vi.fn(() => { throw new Error("blocked"); }),
    };

    expect(readLoadingAnimationMode(storage)).toBe("ALWAYS");
    expect(shouldShowLoadingAnimation(storage, "ONCE_DAILY", today)).toBe(true);
    expect(() => recordLoadingAnimationShown(storage, "ONCE_DAILY", today)).not.toThrow();
  });
});
