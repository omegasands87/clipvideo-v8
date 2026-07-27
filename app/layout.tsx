import './globals.css';
import type { Metadata } from 'next';
import {
  Inter,
  Montserrat,
  Poppins,
  Anton,
  Bebas_Neue,
  Roboto_Condensed,
} from 'next/font/google';

// Every font offered in the Typography card must actually be loaded here —
// otherwise selecting it in the dropdown has zero visual effect (the
// browser silently falls back to whatever font was already active).
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-inter' });
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-montserrat' });
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-poppins' });
const anton = Anton({ subsets: ['latin'], weight: ['400'], variable: '--font-anton' });
const bebasNeue = Bebas_Neue({ subsets: ['latin'], weight: ['400'], variable: '--font-bebas-neue' });
const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-roboto-condensed',
});

export const metadata: Metadata = {
  title: 'CutClip AI — Client-Side AI Video Processing Studio',
  description: 'Professional AI-powered video clipping studio. 100% client-side, zero uploads, privacy-first.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`dark ${inter.variable} ${montserrat.variable} ${poppins.variable} ${anton.variable} ${bebasNeue.variable} ${robotoCondensed.variable}`}
    >
      <body className={inter.className}>{children}</body>
    </html>
  );
}
