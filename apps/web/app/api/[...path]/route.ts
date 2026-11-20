import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy to the API, resolved at RUNTIME (API_INTERNAL_URL), so one
 * image works in every environment. The browser never talks to the API host,
 * cookies stay first-party and no CORS is needed. The body is forwarded as raw
 * bytes: webhook signatures are computed over them.
 */
export const dynamic = 'force-dynamic';

const API = (process.env.API_INTERNAL_URL ?? 'http://localhost:3311').replace(/\/+$/, '');
const FORWARD_REQUEST = ['content-type', 'cookie', 'user-agent', 'x-requested-with', 'origin', 'accept', 'x-forwarded-for', 'x-real-ip', 'calebe-signature', 'calebe-event-id', 'calebe-event-type', 'calebe-delivery-id'];
const FORWARD_RESPONSE = ['content-type', 'content-disposition', 'retry-after', 'cache-control'];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  if (path.some((p) => p === '..' || p.includes('\\'))) return new Response('Bad path', { status: 400 });
  const url = `${API}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return Response.json({ statusCode: 503, code: 'service_unavailable', message: 'API indisponível' }, { status: 503 });
  }
  const out = new Headers();
  for (const h of FORWARD_RESPONSE) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
