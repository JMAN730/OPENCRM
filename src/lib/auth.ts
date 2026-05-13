import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { safeGet, safeSetEx } from "@/lib/redis";
import { isUserRole, type UserRole } from "@/server/authz";

// Pre-computed bcrypt hash used when the email is not found, so we always
// spend roughly the same time as a real compare. Prevents user enumeration
// via timing differences. The plaintext is intentionally never accepted by
// the credentials path: even a perfect "match" returns null because the
// user record itself is missing.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8X.7w//OAYg8K7HbI4Z0sSb4uSv9.K";

type CachedUser = {
  id: string;
  email: string | null;
  role: UserRole;
  organizationId: string | null;
  teamId: string | null;
};

const SESSION_USER_TTL_SECONDS = 60;

function cacheKey(userId: string): string {
  return `auth:user:${userId}`;
}

function normalizeRole(value: unknown): UserRole {
  return isUserRole(value) ? value : "USER";
}

async function readCachedUser(userId: string): Promise<CachedUser | null> {
  const raw = await safeGet(cacheKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedUser;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedUser(user: CachedUser): Promise<void> {
  await safeSetEx(cacheKey(user.id), SESSION_USER_TTL_SECONDS, JSON.stringify(user));
}

/**
 * Fetch the freshest authorization snapshot for a user. Returns null if the
 * user was deleted. Cached in Redis for SESSION_USER_TTL_SECONDS to keep this
 * cheap on every request while still revoking deleted accounts within a
 * minute. When Redis is down, we fall back to a direct DB read.
 */
async function loadAuthSnapshot(userId: string): Promise<CachedUser | null> {
  const cached = await readCachedUser(userId);
  if (cached) return cached;

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, organizationId: true, teamId: true },
  });
  if (!dbUser) return null;

  const snapshot: CachedUser = {
    id: dbUser.id,
    email: dbUser.email,
    role: normalizeRole(dbUser.role),
    organizationId: dbUser.organizationId,
    teamId: dbUser.teamId,
  };
  await writeCachedUser(snapshot);
  return snapshot;
}

export async function invalidateAuthSnapshot(userId: string): Promise<void> {
  const { safeDel } = await import("@/lib/redis");
  await safeDel(cacheKey(userId));
}

export const authOptions: NextAuthOptions = {
  // Explicitly control secure cookies based on actual protocol.
  // When running behind a reverse proxy on HTTP, the __Secure- prefix
  // would cause browsers to silently drop the cookie.
  useSecureCookies: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        // Rate-limit per email to slow brute force. We don't have a trusted
        // IP here (NextAuth doesn't pass the request in App Router), so we
        // key on email alone — sufficient to block credential stuffing on a
        // single account.
        const rl = await rateLimit({
          key: `auth:signin:${email}`,
          limit: 10,
          windowSeconds: 60,
        });
        if (!rl.ok) {
          // Returning null surfaces as "invalid credentials" on the client,
          // which is the right user-facing message — we don't want to leak
          // that this account is being attacked.
          return null;
        }

        // Strict email match — no name fallback (collision risk).
        const user = await prisma.user.findUnique({
          where: { email },
        });

        // Constant-time work whether or not the user exists, to prevent
        // timing-based enumeration. We compare against a dummy hash when
        // the account is missing or has no password set (OAuth-only).
        const hash = user?.password ?? DUMMY_HASH;
        const valid = await bcrypt.compare(credentials.password, hash);

        if (!user || !user.password || !valid) return null;

        return user;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days — persists across browser close
  },
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId;
        session.user.teamId = token.teamId ?? null;
      }
      return session;
    },
    async jwt({ token, user }) {
      // First-time sign-in: hydrate token from the user record.
      if (user) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: (user.email ?? "").toLowerCase() || undefined },
            select: { id: true, email: true, role: true, organizationId: true, teamId: true },
          });
          if (dbUser) {
            token.id = dbUser.id;
            token.email = dbUser.email ?? undefined;
            token.role = normalizeRole(dbUser.role);
            token.organizationId = dbUser.organizationId;
            token.teamId = dbUser.teamId;
            await writeCachedUser({
              id: dbUser.id,
              email: dbUser.email,
              role: normalizeRole(dbUser.role),
              organizationId: dbUser.organizationId,
              teamId: dbUser.teamId,
            });
          }
        } catch (err) {
          console.error("[auth] jwt hydration error:", err);
        }
        return token;
      }

      // Subsequent refresh: revalidate the token against the database so
      // that deleted users can't keep using their JWT for the full 30-day
      // window, and so role/org/team changes propagate without forcing
      // re-login. Cached in Redis with a 60s TTL.
      if (token.id) {
        try {
          const snapshot = await loadAuthSnapshot(token.id);
          if (!snapshot) {
            // User no longer exists. Returning {} makes downstream auth
            // checks fail (`session.user` will be undefined) and the
            // client gets bounced to /auth/signin on the next request.
            return {} as typeof token;
          }
          token.email = snapshot.email ?? undefined;
          token.role = snapshot.role;
          token.organizationId = snapshot.organizationId;
          token.teamId = snapshot.teamId;
        } catch (err) {
          // Soft-fail: if the DB is down, keep the existing token rather
          // than locking everyone out. This is a tradeoff — a deleted
          // user's session survives a DB outage. Logged so we notice.
          console.error("[auth] jwt revalidation error:", err);
        }
      }
      return token;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
