export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,apn,apikey,X-Client-Info",
  "Access-Control-Max-Age": "86400",
};

export const preflight = (req: Request): Response | null => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }
  return null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Response) return false;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return false;
  if (value instanceof Blob) return false;
  if (value instanceof FormData) return false;
  if (value instanceof URLSearchParams) return false;
  if (value instanceof ReadableStream) return false;
  return true;
};

export const withCors = (body?: BodyInit | Record<string, unknown> | null, init: ResponseInit = {}) => {
  if (body instanceof Response) {
    const headers = new Headers(body.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      if (!headers.has(key)) headers.set(key, value);
    });
    return new Response(body.body, {
      status: init.status ?? body.status,
      statusText: init.statusText ?? body.statusText,
      headers,
    });
  }

  const headers = new Headers(init.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    if (!headers.has(key)) headers.set(key, value);
  });

  let payload: BodyInit | null = null;
  if (body == null) {
    payload = null;
  } else if (isPlainObject(body)) {
    if (!headers.has("content-type")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    payload = JSON.stringify(body);
  } else {
    payload = body;
  }

  return new Response(payload, {
    ...init,
    headers,
  });
};
