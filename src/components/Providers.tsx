"use client";

import { SessionProvider, useSession } from "next-auth/react";
import TRPCProvider from "@/app/_trpc/Provider";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";

function LoadingWrapper({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [show, setShow] = useState(true);

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
