import {
  newHttpBatchRpcResponse,
  newWorkersWebSocketRpcResponse,
} from "capnweb";
import { type Context, Hono } from "hono";
import { upgradeWebSocket } from "hono/cloudflare-workers";
import { validator } from "hono/validator";
import type { UpgradeWebSocket } from "hono/ws";
import { z } from "zod";
import { VerifySession } from "@/shared/verify";

const verify = new Hono<{ Bindings: CloudflareBindings }>();

export function newRpcResponse(
  c: Context,
  localMain: unknown,
  options?: { upgradeWebSocket?: UpgradeWebSocket }
): Response | Promise<Response> {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return newHttpBatchRpcResponse(c.req.raw, localMain);
  }

  // biome-ignore lint/correctness/noUndeclaredVariables: this is a global in Cloudflare Workers
  if (options?.upgradeWebSocket && typeof WebSocketPair !== "undefined") {
    return newWorkersWebSocketRpcResponse(c.req.raw, localMain);
  }

  return new Response("Bad request", { status: 400 });
}

verify.all(
  "/session/:id",
  validator("param", (value, c) => {
    const parsed = z.object({ id: z.string() }).safeParse(value);

    if (!parsed.success) {
      return c.json(
        { error: { code: "BAD_REQUEST", message: "Invalid session ID" } },
        400
      );
    }

    return parsed.data;
  }),
  (c) => {
    const { id } = c.req.valid("param");

    // TODO: Validate the session ID against the database

    return newRpcResponse(c, new VerifySession(c.env, id), {
      upgradeWebSocket,
    });
  }
);

export default verify;
