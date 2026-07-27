import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for google-webfonts-helper (gwfh.mranftl.com).
 *
 * The browser cannot fetch that API (or the resulting .ttf URLs) directly
 * because of CORS. This route runs on the same origin as the app, so the
 * client can call it without CORS issues. The response is cached by the
 * client in IndexedDB (fontCache.ts) after the first successful download.
 *
 * Query params:
 *   id     – gwfh font id, e.g. "poppins", "inter", "bebas-neue"
 *   weight – font weight string, e.g. "700", "400" (optional, defaults to 400)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_IDS = new Set([
  'inter',
  'montserrat',
  'poppins',
  'anton',
  'bebas-neue',
  'roboto-condensed',
]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = (searchParams.get('id') || '').toLowerCase().trim();
  const weight = (searchParams.get('weight') || '400').trim();

  if (!id || !ALLOWED_IDS.has(id)) {
    return NextResponse.json({ error: 'Invalid or unsupported font id' }, { status: 400 });
  }

  try {
    const metaRes = await fetch(
      `https://gwfh.mranftl.com/api/fonts/${encodeURIComponent(id)}?subsets=latin`,
      {
        // Server-side fetch has no CORS restriction.
        headers: { Accept: 'application/json' },
        // Avoid hanging forever if the upstream is slow.
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!metaRes.ok) {
      return NextResponse.json(
        { error: `Upstream meta failed: ${metaRes.status}` },
        { status: 502 }
      );
    }

    const meta = await metaRes.json();
    const variants: any[] = meta.variants ?? [];

    const variant =
      variants.find(
        (v) => String(v.id) === weight || String(v.fontWeight) === weight
      ) ??
      variants.find((v) => v.id === 'regular' || v.id === '400') ??
      variants[0];

    const ttfUrl: string | undefined = variant?.ttf ?? variant?.fontUrl?.ttf;
    if (!ttfUrl) {
      return NextResponse.json({ error: 'No TTF URL found for this font/weight' }, { status: 404 });
    }

    const fontRes = await fetch(ttfUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!fontRes.ok) {
      return NextResponse.json(
        { error: `Upstream TTF failed: ${fontRes.status}` },
        { status: 502 }
      );
    }

    const buffer = await fontRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'font/ttf',
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Allow the browser to cache aggressively; client also stores in IndexedDB.
      },
    });
  } catch (err: any) {
    const message = err?.name === 'TimeoutError' ? 'Upstream timeout' : (err?.message || 'Proxy error');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
