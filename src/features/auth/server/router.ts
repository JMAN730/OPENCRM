import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc";

export const authRouter = createTRPCRouter({
  // Stub — email-based reset is not yet implemented. Returns success so the UI
  // can show a confirmation without exposing account existence or resetting passwords.
  resetPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async () => {
      return { success: true };
    }),
});
