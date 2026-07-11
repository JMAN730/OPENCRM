export const LOADING_ANIMATION_MODE_KEY = "clientcore:loading-animation-mode";
export const LOADING_ANIMATION_LAST_SHOWN_KEY = "clientcore:loading-animation-last-shown";

export type LoadingAnimationMode = "ALWAYS" | "ONCE_DAILY" | "OFF";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLoadingAnimationMode(storage: StorageReader | null): LoadingAnimationMode {
  try {
    const value = storage?.getItem(LOADING_ANIMATION_MODE_KEY);
    if (value === "ONCE_DAILY" || value === "OFF") return value;
  } catch {
    // Storage may be unavailable in privacy-focused browser configurations.
  }
  return "ALWAYS";
}

export function writeLoadingAnimationMode(storage: StorageWriter | null, mode: LoadingAnimationMode): void {
  try {
    storage?.setItem(LOADING_ANIMATION_MODE_KEY, mode);
  } catch {
    // The server preference remains authoritative when browser storage fails.
  }
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shouldShowLoadingAnimation(
  storage: StorageReader | null,
  mode: LoadingAnimationMode,
  date = new Date(),
): boolean {
  if (mode === "OFF") return false;
  if (mode === "ALWAYS") return true;

  try {
    return storage?.getItem(LOADING_ANIMATION_LAST_SHOWN_KEY) !== getLocalDateKey(date);
  } catch {
    return true;
  }
}

export function recordLoadingAnimationShown(
  storage: StorageWriter | null,
  mode: LoadingAnimationMode,
  date = new Date(),
): void {
  if (mode !== "ONCE_DAILY") return;
  try {
    storage?.setItem(LOADING_ANIMATION_LAST_SHOWN_KEY, getLocalDateKey(date));
  } catch {
    // Failing open is preferable to blocking the app on browser storage.
  }
}
