import { DefaultSession } from "next-auth";
import type { UserRole } from "@/server/authz";

type LoadingAnimationMode = "ALWAYS" | "ONCE_DAILY" | "OFF";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId: string | null;
      teamId: string | null;
      loadingAnimationMode: LoadingAnimationMode;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    organizationId?: string | null;
    teamId?: string | null;
    loadingAnimationMode?: LoadingAnimationMode;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    name?: string | null;
    role: UserRole;
    organizationId: string | null;
    teamId: string | null;
    loadingAnimationMode: LoadingAnimationMode;
    // Optional so JWTs minted before this field existed still type-check;
    // such tokens adopt the current version on their next refresh.
    sessionVersion?: number;
  }
}
