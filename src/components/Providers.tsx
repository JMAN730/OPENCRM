"use client";

import { SessionProvider } from "next-auth/react";
import TRPCProvider from "@/app/_trpc/Provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TRPCProvider>{children}</TRPCProvider>
    </SessionProvider>
  );
}
