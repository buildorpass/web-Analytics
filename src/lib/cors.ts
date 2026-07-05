/** CORS for cross-origin ingest (e.g. test.html opened via file://). */
export function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("origin");

  // Browsers send Origin: null for file:// pages; "*" is not accepted in that case.
  const allowOrigin = origin ?? "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function corsResponse(
  body: BodyInit | null,
  init: ResponseInit & { request?: Request }
): Response {
  const { request, headers: extraHeaders, ...rest } = init;
  return new Response(body, {
    ...rest,
    headers: {
      ...corsHeaders(request),
      ...Object.fromEntries(new Headers(extraHeaders).entries()),
    },
  });
}
