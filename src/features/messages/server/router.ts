import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

const MAX_MESSAGE_LENGTH = 4000;

const memberSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

/**
 * Canonical pair ordering: a conversation stores its two participants as
 * (userAId, userBId) with userAId < userBId, so the composite unique index
 * maps every user pair to exactly one conversation.
 */
function canonicalPair(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

/**
 * Fetch a conversation only if it belongs to the caller's organization AND
 * the caller is one of its two participants. Everything below reads/writes
 * through this gate so no procedure can touch another user's thread.
 */
async function getOwnConversation(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  conversationId: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
  });
  if (!conversation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
  }
  return conversation;
}

export const messagesRouter = createTRPCRouter({
  /** The caller's conversations, newest activity first, with unread counts. */
  listConversations: organizationProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const conversations = await ctx.prisma.conversation.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: { select: memberSelect },
        userB: { select: memberSelect },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [
        { lastMessageAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
    });

    const unread = conversations.length
      ? await ctx.prisma.message.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversations.map((c) => c.id) },
            senderId: { not: userId },
            readAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const unreadByConversation = new Map(
      unread.map((u) => [u.conversationId, u._count._all]),
    );

    return conversations.map((c) => ({
      id: c.id,
      otherUser: c.userAId === userId ? c.userB : c.userA,
      lastMessage: c.messages[0] ?? null,
      unreadCount: unreadByConversation.get(c.id) ?? 0,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
    }));
  }),

  /** Get or create the caller's 1:1 conversation with another org member. */
  start: organizationProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (input.userId === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot message yourself.",
        });
      }

      const target = await ctx.prisma.user.findFirst({
        where: { id: input.userId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      const pair = canonicalPair(userId, input.userId);
      return ctx.prisma.conversation.upsert({
        where: {
          organizationId_userAId_userBId: {
            organizationId: ctx.organizationId,
            ...pair,
          },
        },
        create: { organizationId: ctx.organizationId, ...pair },
        update: {},
      });
    }),

  /**
   * Messages in one of the caller's conversations, oldest first. Bounded to
   * the most recent 200 — plenty for an internal DM thread without paging.
   */
  getMessages: organizationProcedure
    .input(z.object({ conversationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await getOwnConversation(
        ctx.prisma,
        ctx.organizationId,
        userId,
        input.conversationId,
      );

      const messages = await ctx.prisma.message.findMany({
        where: { conversationId: input.conversationId },
        include: { sender: { select: memberSelect } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return messages.reverse();
    }),

  send: organizationProcedure
    .input(
      z.object({
        conversationId: z.string().min(1),
        body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await getOwnConversation(
        ctx.prisma,
        ctx.organizationId,
        userId,
        input.conversationId,
      );

      const sentAt = new Date();
      const [message] = await ctx.prisma.$transaction([
        ctx.prisma.message.create({
          data: {
            conversationId: input.conversationId,
            senderId: userId,
            body: input.body,
            createdAt: sentAt,
          },
        }),
        // Conditional update keeps lastMessageAt monotonic: a slower
        // concurrent send must not move the thread's ordering timestamp
        // backward.
        ctx.prisma.conversation.updateMany({
          where: {
            id: input.conversationId,
            OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: sentAt } }],
          },
          data: { lastMessageAt: sentAt },
        }),
      ]);
      return message;
    }),

  /** Mark every message from the other participant as read. */
  markRead: organizationProcedure
    .input(z.object({ conversationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await getOwnConversation(
        ctx.prisma,
        ctx.organizationId,
        userId,
        input.conversationId,
      );

      await ctx.prisma.message.updateMany({
        where: {
          conversationId: input.conversationId,
          senderId: { not: userId },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
      return { ok: true };
    }),

  /** Total unread messages across all of the caller's conversations. */
  unreadCount: organizationProcedure.query(({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        conversation: {
          organizationId: ctx.organizationId,
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      },
    });
  }),
});
