import { beforeEach, describe, expect, it } from "vitest";
import { createTestCaller } from "@/test/trpc";

const OTHER_USER = { id: "user-2", name: "Other", email: "other@example.com", image: null };
const ME = { id: "user-1", name: "Test User", email: "user@example.com", image: null };

describe("messagesRouter.listConversations", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("returns the other participant, last message, and unread count", async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-1",
        organizationId: "org-1",
        userAId: "user-1",
        userBId: "user-2",
        userA: ME,
        userB: OTHER_USER,
        messages: [{ id: "msg-9", body: "hey", senderId: "user-2" }],
        lastMessageAt: new Date("2026-07-15T10:00:00Z"),
        createdAt: new Date("2026-07-01T10:00:00Z"),
      },
    ]);
    prisma.message.groupBy.mockResolvedValue([
      { conversationId: "conv-1", _count: { _all: 3 } },
    ]);

    const result = await caller.messages.listConversations();

    expect(result).toHaveLength(1);
    expect(result[0].otherUser).toEqual(OTHER_USER);
    expect(result[0].lastMessage).toMatchObject({ id: "msg-9" });
    expect(result[0].unreadCount).toBe(3);

    // Only the caller's own conversations, scoped to their org.
    const args = prisma.conversation.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      organizationId: "org-1",
      OR: [{ userAId: "user-1" }, { userBId: "user-1" }],
    });
    // Unread counts exclude the caller's own messages.
    const groupByArgs = prisma.message.groupBy.mock.calls[0][0];
    expect(groupByArgs.where).toMatchObject({
      senderId: { not: "user-1" },
      readAt: null,
    });
  });

  it("resolves the other participant when the caller is userB", async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-1",
        userAId: "user-2",
        userBId: "user-1",
        userA: OTHER_USER,
        userB: ME,
        messages: [],
        lastMessageAt: null,
        createdAt: new Date(),
      },
    ]);

    const result = await caller.messages.listConversations();

    expect(result[0].otherUser).toEqual(OTHER_USER);
    expect(result[0].lastMessage).toBeNull();
    expect(result[0].unreadCount).toBe(0);
    // No conversations with unread rows → groupBy still ran with the ids,
    // but an empty conversation list must skip it entirely (covered below).
  });

  it("returns [] without querying unread counts when there are no conversations", async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    const result = await caller.messages.listConversations();

    expect(result).toEqual([]);
    expect(prisma.message.groupBy).not.toHaveBeenCalled();
  });
});

describe("messagesRouter.start", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("upserts the canonical pair for an org member", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "user-2" });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1" });

    const result = await caller.messages.start({ userId: "user-2" });

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-2", organizationId: "org-1" },
      }),
    );
    expect(prisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userAId_userBId: {
          organizationId: "org-1",
          userAId: "user-1",
          userBId: "user-2",
        },
      },
      create: { organizationId: "org-1", userAId: "user-1", userBId: "user-2" },
      update: {},
    });
    expect(result.id).toBe("conv-1");
  });

  it("orders the pair canonically when the caller sorts second", async () => {
    const { caller: c2, prisma: p2 } = createTestCaller({
      sessionOverrides: { id: "user-9" },
    });
    p2.user.findFirst.mockResolvedValue({ id: "user-2" });
    p2.conversation.upsert.mockResolvedValue({ id: "conv-1" });

    await c2.messages.start({ userId: "user-2" });

    const args = p2.conversation.upsert.mock.calls[0][0];
    expect(args.create).toEqual({
      organizationId: "org-1",
      userAId: "user-2",
      userBId: "user-9",
    });
  });

  it("rejects messaging yourself", async () => {
    await expect(caller.messages.start({ userId: "user-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("rejects a target outside the caller's organization", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      caller.messages.start({ userId: "user-other-org" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.conversation.upsert).not.toHaveBeenCalled();
  });
});

describe("messagesRouter.getMessages", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("returns the thread oldest-first for a participant", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    prisma.message.findMany.mockResolvedValue([
      { id: "msg-2", body: "second", createdAt: new Date("2026-07-15T11:00:00Z") },
      { id: "msg-1", body: "first", createdAt: new Date("2026-07-15T10:00:00Z") },
    ]);

    const result = await caller.messages.getMessages({ conversationId: "conv-1" });

    expect(result.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
    // Membership gate: id + org + participant.
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "conv-1",
          organizationId: "org-1",
          OR: [{ userAId: "user-1" }, { userBId: "user-1" }],
        },
      }),
    );
  });

  it("throws NOT_FOUND for a conversation the caller is not part of", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      caller.messages.getMessages({ conversationId: "conv-foreign" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe("messagesRouter.send", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("creates the message and bumps lastMessageAt monotonically", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    prisma.message.create.mockResolvedValue({ id: "msg-1", body: "hello" });

    const result = await caller.messages.send({
      conversationId: "conv-1",
      body: "hello",
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-1",
        senderId: "user-1",
        body: "hello",
        createdAt: expect.any(Date),
      },
    });
    // Conditional update: a slower concurrent send must not move
    // lastMessageAt backward.
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "conv-1",
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: expect.any(Date) } }],
      },
      data: { lastMessageAt: expect.any(Date) },
    });
    expect(result.id).toBe("msg-1");
  });

  it("rejects an empty body with BAD_REQUEST before touching the database", async () => {
    await expect(
      caller.messages.send({ conversationId: "conv-1", body: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a conversation the caller is not part of", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      caller.messages.send({ conversationId: "conv-foreign", body: "hi" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The membership gate must carry the full authorization scope.
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "conv-foreign",
          organizationId: "org-1",
          OR: [{ userAId: "user-1" }, { userBId: "user-1" }],
        },
      }),
    );
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("messagesRouter.markRead", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  it("marks only the other participant's unread messages", async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });

    await caller.messages.markRead({ conversationId: "conv-1" });

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: "conv-1",
        senderId: { not: "user-1" },
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it("throws NOT_FOUND for a conversation the caller is not part of", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await expect(
      caller.messages.markRead({ conversationId: "conv-foreign" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The membership gate must carry the full authorization scope.
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "conv-foreign",
          organizationId: "org-1",
          OR: [{ userAId: "user-1" }, { userBId: "user-1" }],
        },
      }),
    );
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });
});

describe("messagesRouter.unreadCount", () => {
  it("counts unread messages addressed to the caller across their org conversations", async () => {
    const { caller, prisma } = createTestCaller();
    prisma.message.count.mockResolvedValue(5);

    const result = await caller.messages.unreadCount();

    expect(result).toBe(5);
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: {
        readAt: null,
        senderId: { not: "user-1" },
        conversation: {
          organizationId: "org-1",
          OR: [{ userAId: "user-1" }, { userBId: "user-1" }],
        },
      },
    });
  });
});
