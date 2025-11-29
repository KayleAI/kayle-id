import { OpenAPIHono } from "@hono/zod-openapi";

const webhookEncryptionKeys = new OpenAPIHono<{
  Bindings: CloudflareBindings;
}>();

export default webhookEncryptionKeys;
