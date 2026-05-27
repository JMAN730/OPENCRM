import { type NextRequest } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createTRPCContext } from "@/server/trpc";
import { rateLimit } from "@/lib/rateLimit";
import { resolveLeadScope } from "@/server/teams/scope";
import { buildAIContext, formatAIContext, SALES_MANAGER_SYSTEM_PROMPT } from "@/features/ai/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_SCHEMA = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .min(1)
    .max(20),
});

const encoder = new TextEncoder();
const sse = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
const DONE = encoder.encode("data: [DONE]\n\n");

function singleMessageStream(message: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(sse({ content: message }));
      controller.enqueue(DONE);
      controller.close();
    },
  });
}

function streamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await createTRPCContext({ headers: req.headers });
  const user = ctx.session?.user as
    | { id?: string; organizationId?: string; role?: string }
    | undefined;
  if (!user?.id || !user.organizationId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;
  const organizationId = user.organizationId;
  const role = user.role ?? "USER";

  const limit = await rateLimit({ key: `ai:chat:${userId}`, limit: 30, windowSeconds: 60 });
  if (!limit.ok) {
    return Response.json({ error: "Too many AI requests. Try again in a moment." }, { status: 429 });
  }

  let parsed: z.infer<typeof BODY_SCHEMA>;
  try {
    parsed = BODY_SCHEMA.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return streamResponse(
      singleMessageStream(
        "AI is not configured. Add `DEEPSEEK_API_KEY` to your `.env` file and restart the server.",
      ),
    );
  }

  const scope = await resolveLeadScope(ctx.prisma, userId, organizationId, role);
  const aiContext = await buildAIContext(ctx.prisma, scope);
  const systemPrompt = `${SALES_MANAGER_SYSTEM_PROMPT}\n\n${formatAIContext(aiContext)}`;

  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const completion = await client.chat.completions.create({
          model: process.env.AI_MODEL ?? "deepseek-chat",
          stream: true,
          max_tokens: 700,
          temperature: 0.4,
          messages: [{ role: "system", content: systemPrompt }, ...parsed.messages],
        });
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(sse({ content: delta }));
        }
      } catch (err) {
        controller.enqueue(
          sse({ error: err instanceof Error ? err.message : "AI request failed." }),
        );
      } finally {
        controller.enqueue(DONE);
        controller.close();
      }
    },
  });

  return streamResponse(stream);
}
