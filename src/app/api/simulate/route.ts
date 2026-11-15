import { auth } from '@clerk/nextjs/server';
import { checkSimulateRequest, validateSimulateResponse } from '@/model/engine';

/** Proxy to the SFINCS flood engine (`engine/`, a separate Docker service). Signed-in users only. */
export const runtime = 'nodejs';
export const maxDuration = 300;

const ID = /^[0-9a-f]{16}$/;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

const unavailable = () => json({ error: 'engine_unavailable', fallback: 'hand' }, 503);

function engineBase(): string | null {
  const url = process.env.ENGINE_URL?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return json({ error: 'Sign in required' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  const problem = checkSimulateRequest(body);
  if (problem) return json({ error: problem }, 400);

  const base = engineBase();
  if (!base) return unavailable();

  let res: Response;
  try {
    // Only the request body goes to the engine: no cookies or Clerk tokens.
    res = await fetch(`${base}/simulate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-engine-key': process.env.ENGINE_SECRET ?? '',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(200_000),
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return json({ error: 'timeout' }, 504);
    return unavailable();
  }

  if (res.status === 400) {
    const e = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return json({ error: typeof e?.error === 'string' ? e.error : 'bad request' }, 400);
  }
  if (res.status === 504) return json({ error: 'timeout' }, 504);
  if (!res.ok) return unavailable();

  const result = validateSimulateResponse(await res.json().catch(() => null));
  if (!result) return unavailable();
  return json(
    { ...result, maxDepth: { ...result.maxDepth, url: `/api/simulate?id=${result.id}` } },
    200,
  );
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return json({ error: 'Sign in required' }, 401);

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!ID.test(id)) return json({ error: 'not found' }, 404);
  const base = engineBase();
  if (!base) return unavailable();

  let res: Response;
  try {
    res = await fetch(`${base}/runs/${id}/maxdepth.png`, {
      headers: { 'x-engine-key': process.env.ENGINE_SECRET ?? '' },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    return unavailable();
  }
  if (!res.ok || !res.body) return json({ error: 'not found' }, 404);
  return new Response(res.body, {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' },
  });
}
