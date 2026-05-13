import { initTRPC, TRPCError } from "@trpc/server";
import { getServerSession, type Session } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ZodError } from "zod";
import { isUserRole, type UserRole } from "@/server/authz";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Primary: try getServerSession (uses next/headers cookies() under the hood).
  // The jwt callback in authOptions revalidates the user against the DB so
  // deleted accounts get rejected here.
  let session: Session | null = await getServerSession(authOptions);

  // Fallback: if getServerSession returned null but a valid JWT cookie exists,
  // decode it directly. This handles cases where getServerSession fails due to
  // NEXTAUTH_URL mismatch, cookie‐prefix issues, or internal fetch failures
  // that don't affect direct JWT decoding. We still revalidate the user
  // against the database before trusting the token, otherwise a deleted
  // user's JWT could bypass the primary path's check.
  if (!session) {
    try {
      const { cookies, headers } = await import("next/headers");
      const cookieStore = await cookies();
      const headerStore = await headers();

      // Build a minimal request-like object that getToken can read
      const cookieObj: Record<string, string> = {};
      for (const c of cookieStore.getAll()) {
        cookieObj[c.name] = c.value;
      }
      const headerObj: Record<string, string> = {};
      headerStore.forEach((value, key) => {
        headerObj[key] = value;
      });

      const token = await getToken({
        req: { headers: headerObj, cookies: cookieObj } as never,
        secret: process.env.NEXTAUTH_SECRET,
      });

      if (token?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: String(token.id) },
          select: { id: true, email: true, name: true, image: true, role: true, organizationId: true, teamId: true },
        });
        if (dbUser) {
          const role: UserRole = isUserRole(dbUser.role) ? dbUser.role : "USER";
          session = {
            user: {
              id: dbUser.id,
              email: dbUser.email ?? undefined,
              name: dbUser.name ?? undefined,
              image: dbUser.image ?? undefined,
              role,
              organizationId: dbUser.organizationId,
              teamId: dbUser.teamId,
            },
            expires: new Date(
              ((token.exp as number) ?? Math.floor(Date.now() / 1000) + 60 * 60) * 1000
            ).toISOString(),
          } as Session;
        }
      }
    } catch (err) {
      console.error("[trpc] JWT fallback error:", err);
    }
  }

  return {
    prisma,
    session,
    ...opts,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const protectedProcedure = enforceUserIsAuthed;

const enforceUserHasOrg = enforceUserIsAuthed.use(({ ctx, next }) => {
  const { organizationId } = ctx.session.user;
  if (!organizationId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "User has no organization.",
    });
  }
  return next({ ctx: { ...ctx, organizationId } });
});

export const organizationProcedure = enforceUserHasOrg;
