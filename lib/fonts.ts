/**
 * Every font offered in the Typography card's "Font Family" dropdown, with:
 *  - `cssVar`: the CSS variable set up in app/layout.tsx via next/font/google
 *    (so the live preview actually renders in that font instead of silently
 *    falling back to the browser default because the font was never loaded).
 *  - `gwfhId`: the font's id on the google-webfonts-helper API, used by the
 *    export engine to fetch a real .ttf file at render time so ffmpeg's
 *    drawtext filter can burn subtitles in using the SAME font.
 */
export const FONT_REGISTRY: Record<string, { cssVar: string; gwfhId: string; weight: string }> = {
  Inter: { cssVar: 'var(--font-inter)', gwfhId: 'inter', weight: '700' },
  Montserrat: { cssVar: 'var(--font-montserrat)', gwfhId: 'montserrat', weight: '700' },
  Poppins: { cssVar: 'var(--font-poppins)', gwfhId: 'poppins', weight: '700' },
  Anton: { cssVar: 'var(--font-anton)', gwfhId: 'anton', weight: '400' },
  'Bebas Neue': { cssVar: 'var(--font-bebas-neue)', gwfhId: 'bebas-neue', weight: '400' },
  'Roboto Condensed': { cssVar: 'var(--font-roboto-condensed)', gwfhId: 'roboto-condensed', weight: '700' },
};

export function fontCssVar(fontFamily: string): string {
  return FONT_REGISTRY[fontFamily]?.cssVar ?? FONT_REGISTRY.Inter.cssVar;
}
