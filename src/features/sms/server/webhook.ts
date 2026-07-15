import { validateTwilioWebhook } from "./twilio";

export async function verifiedTwilioForm(request: Request): Promise<
  | { ok: true; params: Record<string, string> }
  | { ok: false; response: Response }
> {
  // Public endpoint: malformed bodies (scanners, health checks) must get a
  // controlled 400, not an unhandled 500 from formData().
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, response: new Response("Bad Request", { status: 400 }) };
  }
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

