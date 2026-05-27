import { z } from "zod";
import OpenAI from "openai";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { buildAIContext, formatAIContext, SALES_MANAGER_SYSTEM_PROMPT } from "./context";

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

      // Build structured sales analytics for the sales-manager system prompt.
      const context = await buildAIContext(ctx.prisma, organizationId);
      const systemPrompt = `${SALES_MANAGER_SYSTEM_PROMPT}\n\n${formatAIContext(context)}`;

      const completion = await client().chat.completions.create({
        model: model(),
        messages: [
          { role: "system", content: systemPrompt },
          ...input.messages,
        ],
        max_tokens: 700,
        temperature: 0.4,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned an empty response.");

      return { content };
    }),
});
