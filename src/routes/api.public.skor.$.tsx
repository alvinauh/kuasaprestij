import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM_BASE_URL =
  process.env.SKOR_API_BASE_URL ??
  process.env.VITE_API_BASE_URL ??
  "https://api.kuasa.tech:8443";

function buildCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function buildUpstreamUrl(pathname: string, search: string) {
  const upstream = new URL(UPSTREAM_BASE_URL);
  const incomingPath = pathname.replace(/^\/api\/public\/skor\/?/, "");
  upstream.pathname = `${upstream.pathname.replace(/\/$/, "")}/${incomingPath}`.replace(/\/+/g, "/");
  upstream.search = search;
  return upstream.toString();
}

function isStartSessionRequest(pathname: string) {
  return pathname.replace(/\/$/, "").endsWith("/start_session");
}

function readStringField(source: unknown, key: string, fallback: string) {
  if (!source || typeof source !== "object") return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function buildStartSessionFallback(bodyText?: string) {
  let payload: unknown = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
  }

  const subject = readStringField(payload, "subject", "General Studies");
  const topic = readStringField(payload, "topic", "Core Material");
  const questionType = readStringField(payload, "question_type", "mcq");

  return {
    session_id: `fallback-${Date.now()}`,
    fallback: true,
    subject,
    topic,
    question_type: questionType,
    question: `Which statement best describes ${topic} in ${subject}?`,
    options: {
      A: `${topic} is a key area studied in ${subject}.`,
      B: `${topic} is unrelated to ${subject}.`,
      C: `${topic} only applies outside the classroom.`,
      D: `${topic} has no practical examples.`,
    },
    correct: "A",
    explanation: "The quiz service is temporarily unavailable, so this practice question keeps the session usable.",
  };
}

function startSessionFallbackResponse(request: Request, bodyText?: string) {
  return new Response(
    JSON.stringify(buildStartSessionFallback(bodyText)),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...buildCorsHeaders(request),
      },
    },
  );
}

async function proxyRequest(request: Request) {
  const url = new URL(request.url);
  const upstreamUrl = buildUpstreamUrl(url.pathname, url.search);
  const method = request.method.toUpperCase();
  const corsHeaders = buildCorsHeaders(request);
  let bodyText: string | undefined;

  // Short-circuit any request tied to a fallback session id - upstream doesn't know about it.
  if (url.pathname.includes("/fallback-")) {
    return new Response(
      JSON.stringify({ fallback: true, messages: [], history: [], data: [] }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    bodyText = method === "GET" || method === "HEAD" ? undefined : await request.text();

    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: {
        Accept: request.headers.get("accept") ?? "application/json",
        ...(method !== "GET" && method !== "HEAD"
          ? { "Content-Type": request.headers.get("content-type") ?? "application/json" }
          : {}),
      },
      body: bodyText,
    });

    if (!upstreamResponse.ok && isStartSessionRequest(url.pathname)) {
      console.warn("[Skor proxy] start_session upstream failed", upstreamResponse.status);
      return startSessionFallbackResponse(request, bodyText);
    }

    const responseHeaders = new Headers(corsHeaders);
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (isStartSessionRequest(url.pathname)) {
      console.warn("[Skor proxy] start_session request failed", error);
      return startSessionFallbackResponse(request, bodyText);
    }

    return new Response(
      JSON.stringify({
        error: "Failed to reach quiz backend",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }
}

export const Route = createFileRoute("/api/public/skor/$")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: buildCorsHeaders(request),
        }),
      GET: async ({ request }) => proxyRequest(request),
      POST: async ({ request }) => proxyRequest(request),
    },
  },
});