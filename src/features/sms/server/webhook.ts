import { validateTwilioWebhook } from "./twilio";

export async function verifiedTwilioForm(request: Request): Promise<
  | { ok: true; params: Record<string, string> }
  | { ok: false; response: Response }
> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = String(value);
  });

  const requestUrl = new URL(request.url);
  const baseUrl = (
    process.env.NEXTAUTH_URL ?? `${requestUrl.protocol}//${requestUrl.host}`
  ).replace(/\/$/, "");
  const url = `${baseUrl}${requestUrl.pathname}${requestUrl.search}`;
  const valid = validateTwilioWebhook({
    signature: request.headers.get("x-twilio-signature") ?? "",
    url,
    params,
  });
  if (!valid) return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  return { ok: true, params };
}

export function isPrismaUniqueError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2002",
  );
}
