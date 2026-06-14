import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isManagerOrAdmin } from "@/server/authz";

type DefaultScript = { category: string; title: string; body: string };

const DEFAULT_SCRIPTS: DefaultScript[] = [
  {
    category: "Opening",
    title: "Cold Call Opener",
    body: "Hi [Prospect Name], this is [Your Name] with [Company]. I know I'm catching you out of the blue — I'll keep it quick. We help [industry] businesses [core benefit]. Is that something worth a 2-minute chat about?",
  },
  {
    category: "Opening",
    title: "Warm Follow-up",
    body: "Hi [Prospect Name], this is [Your Name] calling back — we spoke briefly about [topic]. I just wanted to follow up and see if you had any questions or if it makes sense to take the next step.",
  },
  {
    category: "Objection Handling",
    title: "Too Busy",
    body: "Totally understand — I'll be quick. I'm only reaching out because we've seen similar businesses save [X hours/dollars] using our solution. Would 5 minutes this week or next be worth it?",
  },
  {
    category: "Objection Handling",
    title: "Not Interested",
    body: "I appreciate the honesty. Can I ask — is it that you already have this handled, or is it more that the timing isn't right? I want to make sure I'm not wasting your time.",
  },
  {
    category: "Objection Handling",
    title: "Already Have a Solution",
    body: "That's great — it means you see the value in this. A lot of our clients switched from [Competitor]. The main reason was [key differentiator]. Would it make sense to do a quick comparison?",
  },
  {
    category: "Objection Handling",
    title: "Send Me an Email",
    body: "Absolutely, I'll send something over. Just so I can keep it relevant — what's the biggest challenge you're facing with [topic] right now?",
  },
  {
    category: "Closing",
    title: "Trial Close",
    body: "Based on what we've talked about, it sounds like this could be a good fit for you. What would need to happen on your end to move forward?",
  },
  {
    category: "Closing",
    title: "Schedule a Demo",
    body: "I'd love to show you how this works in practice. I have time Tuesday at 10am or Thursday at 2pm — does either of those work for a quick 20-minute walkthrough?",
  },
  {
    category: "Closing",
    title: "Next Steps",
    body: "Great — so the next step would be [action]. I'll send over [materials] today. Does that sound good?",
  },
  {
    category: "Voicemail",
    title: "Standard Voicemail",
    body: "Hi [Prospect Name], this is [Your Name] from [Company]. I'm calling because we help [industry] businesses with [benefit]. I'll be quick — give me a call back at [phone] when you get a chance, or I'll try you again [day]. Thanks!",
  },
];

export const scriptsRouter = createTRPCRouter({
  getAll: organizationProcedure.query(async ({ ctx }) => {
    const existing = await ctx.prisma.salesScript.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { order: "asc" },
    });

    if (existing.length > 0) return existing;

    // Seed defaults on first access for this org
    await ctx.prisma.salesScript.createMany({
      data: DEFAULT_SCRIPTS.map((s, i) => ({
        organizationId: ctx.organizationId,
        category: s.category,
        title: s.title,
        body: s.body,
        order: i,
      })),
    });

    return ctx.prisma.salesScript.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { order: "asc" },
    });
  }),

  replaceAll: organizationProcedure
    .input(
      z.object({
        scripts: z.array(
          z.object({
            category: z.string().min(1).max(100),
            title: z.string().min(1).max(200),
            body: z.string().min(1).max(5000),
            order: z.number().int().min(0),
          }),
        ).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isManagerOrAdmin(ctx.session.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.prisma.$transaction([
        ctx.prisma.salesScript.deleteMany({
          where: { organizationId: ctx.organizationId },
        }),
        ctx.prisma.salesScript.createMany({
          data: input.scripts.map((s) => ({
            organizationId: ctx.organizationId,
            category: s.category,
            title: s.title,
            body: s.body,
            order: s.order,
          })),
        }),
      ]);
    }),
});
