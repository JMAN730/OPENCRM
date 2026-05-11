import { initTRPC, TRPCError } from "@trpc/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ZodError } from "zod";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Primary: try getServerSession (uses next/headers cookies() under the hood)
  let session = await getServerSession(authOptions);

  // Fallback: if getServerSession returned null but a valid JWT cookie exists,
  // decode it directly. This handles cases where getServerSession fails due to
  // NEXTAUTH_URL mismatch, cookie‐prefix issues, or internal fetch failures
  // that don't affect direct JWT decoding.
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
        req: { headers: headerObj, cookies: cookieObj } as any,
        secret: process.env.NEXTAUTH_SECRET,
      });

      if (token?.id && token?.email) {
        session = {
          user: {
            id: token.id as string,
            email: token.email,
            name: token.name as string | undefined,
            role: (token.role as string) ?? "USER",
            organizationId: (token.organizationId as string) ?? null,
          },
          expires: new Date(
            (token.exp as number) * 1000
          ).toISOString(),
        } as any;
        console.info("[trpc] Session recovered from JWT fallback for:", token.email);
      } else {
        console.warn(
          "[trpc] No valid session or JWT token found.",
          "NEXTAUTH_URL:", process.env.NEXTAUTH_URL ?? "(unset)",
        );
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
