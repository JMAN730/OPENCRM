import { z } from "zod";
import OpenAI from "openai";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { assertWithinRateLimit } from "@/lib/rateLimit";

function client() {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

const model = () => process.env.AI_MODEL ?? "deepseek-chat";

const MESSAGE_SCHEMA = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

export const aiRouter = createTRPCRouter({
  chat: organizationProcedure
    .input(
      z.object({
        messages: z.array(MESSAGE_SCHEMA).max(20),
      })
    )
    .output(z.object({ content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const organizationId = ctx.organizationId;

      await assertWithinRateLimit({
        key: `ai:chat:${userId}`,
        limit: 30,
        windowSeconds: 60,
        message: "Too many AI requests. Try again in a moment.",
      });

      // Graceful no-key path — return a chat-friendly message instead of throwing
      if (!process.env.DEEPSEEK_API_KEY) {
        return {
          content:
            "AI is not configured. Add `DEEPSEEK_API_KEY` to your `.env` file and restart the server.",
        };
      }

      // Build live CRM snapshot for the system prompt
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999
      );

      const [leadsByStatus, starredCount, tasksDueToday, overdueTaskCount, recentLeads] =
        await Promise.all([
          ctx.prisma.lead.groupBy({
            by: ["status"],
            where: { organizationId },
            _count: true,
          }),
          ctx.prisma.lead.count({ where: { organizationId, starred: true } }),
          ctx.prisma.task.count({
            where: {
              organizationId,
              deletedAt: null,
              status: { not: "COMPLETED" },
              dueDate: { gte: startOfToday, lte: endOfToday },
            },
          }),
          ctx.prisma.task.count({
            where: {
              organizationId,
              deletedAt: null,
              status: { not: "COMPLETED" },
              dueDate: { lt: startOfToday },
            },
          }),
          ctx.prisma.lead.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { company: true, firstName: true, lastName: true, status: true, starred: true },
          }),
        ]);

      const statusSummary = leadsByStatus
        .map((g) => `${g.status}: ${g._count}`)
        .join(", ");

      const recentLeadsSummary = recentLeads
        .map((l) => {
          const name =
            l.company ??
            [l.firstName, l.lastName].filter(Boolean).join(" ") ??
            "Unknown";
          return `${name} (${l.status}${l.starred ? ", ★" : ""})`;
        })
        .join("; ");

      const systemPrompt =
        "You are a helpful CRM assistant for OpenCRM. Answer questions concisely and " +
        "clearly based on the live org data provided. If the user asks about something " +
        "not in your context, say so honestly.\n\n" +
        "Live org data (as of now):\n" +
        `- Leads by status: ${statusSummary || "none"}\n` +
        `- Starred leads: ${starredCount}\n` +
        `- Tasks due today: ${tasksDueToday}  |  Overdue tasks: ${overdueTaskCount}\n` +
        `- 5 most recent leads: ${recentLeadsSummary || "none"}`;

      const completion = await client().chat.completions.create({
        model: model(),
        messages: [
          { role: "system", content: systemPrompt },
          ...input.messages,
        ],
        max_tokens: 400,
        temperature: 0.5,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned an empty response.");

      return { content };
    }),
});
