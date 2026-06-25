/**
 * Public origin of an incoming request.
 *
 * Behind a proxy (Render/Vercel) the raw req.url is the INTERNAL address
 * (e.g. https://localhost:10000), so any public URL built from it — OAuth
 * redirect URIs, tracking-snippet src, callback endpoints — comes out wrong.
 * Prefer the proxy's forwarded host/proto headers; fall back to the request URL
 * for local dev (where those headers are absent).
 */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const h = req.headers;
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '');
  const host =
    h.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    h.get('host')?.split(',')[0]?.trim() ||
    url.host;
  return `${proto}://${host}`;
}
