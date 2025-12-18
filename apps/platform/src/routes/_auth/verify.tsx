import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Verify } from "@/auth/verify";

export const Route = createFileRoute("/_auth/verify")({
  component: Verify,
  validateSearch: z.object({
    email: z.string().email().optional(),
  }),
});
