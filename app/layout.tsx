import './globals.css';
import type { Metadata } from 'next';

// NOTE: we intentionally do NOT use next/font/google here.
// next/font/google downloads the actual font files from fonts.gstatic.com
// at BUILD TIME and self-hosts them — great when it works, but it means any
// network hiccup/timeout talking to Google's servers during `next build`
// fails the ENTIRE deployment with a hard webpack error (see
// "FetchError: request to https://fonts.gstatic.com/... ETIMEDOUT" /
// "'next/font' error: Failed to fetch 'Inter' from Google Fonts."). That
// dependency is fragile and out of our control (Vercel build region,
// transient Google outages, corporate proxies, etc).
//
// Instead we load the same fonts the normal client-side way: a <link> to
// Google's CSS API in the document head. The browser fetches them at
// runtime (with its own retries/caching), which never blocks the build.
const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Inter:wght@300;400;500;600;700',
    'family=Montserrat:wght@400;700',
    'family=Poppins:wght@400;700',
    'family=Anton',
    'family=Bebas+Neue',
    'family=Roboto+Condensed:wght@400;700',
  ].join('&') +
  '&display=swap';

export const metadata: Metadata = {
  title: 'CutClip AI — Client-Side AI Video Processing Studio',
  description: 'Professional AI-powered video clipping studio. 100% client-side, zero uploads, privacy-first.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body style={{ fontFamily: 'var(--font-inter)' }}>{children}</body>
    </html>
  );
}
