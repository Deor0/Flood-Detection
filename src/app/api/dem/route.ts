const MIN_ZOOM = 10;
const MAX_ZOOM = 14;

function integer(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * Proxies one AWS Terrarium elevation tile so the browser never calls a third party directly.
 * Public and read-only, like the flood desk page that uses it.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const z = integer(params.get('z'));
  const x = integer(params.get('x'));
  const y = integer(params.get('y'));
  if (z === null || x === null || y === null || z < MIN_ZOOM || z > MAX_ZOOM) {
    return Response.json({ error: 'z must be 10-14 and x, y valid integers' }, { status: 400 });
  }
  const size = 2 ** z;
  if (x >= size || y >= size) return Response.json({ error: 'Tile out of range' }, { status: 400 });

  try {
    const upstream = await fetch(
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    );
    if (!upstream.ok) {
      return Response.json(
        { error: 'Elevation tile unavailable' },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return Response.json({ error: 'Elevation tile unavailable' }, { status: 502 });
  }
}
