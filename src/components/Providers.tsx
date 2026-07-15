"use client";

import { SessionProvider, useSession } from "next-auth/react";
import TRPCProvider from "@/app/_trpc/Provider";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  getBrowserStorage,
  readLoadingAnimationMode,
  recordLoadingAnimationShown,
  shouldShowLoadingAnimation,
  writeLoadingAnimationMode,
} from "@/lib/loading-animation";

function LoadingWrapper({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    const storage = getBrowserStorage();
    const mode = readLoadingAnimationMode(storage);
    // The intro animation is an app-boot experience. Keep public entry points
    // immediately usable.
    const shouldShow =
      window.location.pathname !== "/" &&
      !window.location.pathname.startsWith("/auth") &&
      shouldShowLoadingAnimation(storage, mode);
    if (shouldShow) recordLoadingAnimationShown(storage, mode);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setShow(shouldShow);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session.user.loadingAnimationMode) return;
    writeLoadingAnimationMode(getBrowserStorage(), session.user.loadingAnimationMode);
  }, [session?.user.loadingAnimationMode, status]);

  return (
    <>
      <TRPCProvider>{children}</TRPCProvider>
      {show && (
        <LoadingScreen
          sessionReady={status !== "loading"}
          onDone={() => setShow(false)}
        />
      )}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <LoadingWrapper>{children}</LoadingWrapper>
      </SessionProvider>
    </ThemeProvider>
  );
}
