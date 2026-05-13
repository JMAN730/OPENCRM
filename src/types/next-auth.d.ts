import { DefaultSession } from "next-auth";
import type { UserRole } from "@/server/authz";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId: string | null;
      teamId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    organizationId?: string | null;
    teamId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    organizationId: string | null;
    teamId: string | null;
  }
}
