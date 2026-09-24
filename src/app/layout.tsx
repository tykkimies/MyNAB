import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
/**
 * Warm Editorial Finance pairs a literary serif for milestone headlines with a
 * geometric humanist sans for everything operational. Both go through
 * next/font, which downloads them at build time and serves them from our own
 * origin — the Stitch export links fonts.googleapis.com, which `font-src
 * 'self'` in http-security.ts forbids, and widening the CSP for a typeface is
 * not a trade worth making.
 */
const headline = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-headline",
});
const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});
export const metadata: Metadata = {
  title: { default: "MyNAB", template: "%s · MyNAB" },
  description: "A considered home for your money.",
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const dark = (await cookies()).get("mynab-theme")?.value === "dark";
  return (
    <html
      lang="en"
      data-theme={dark ? "dark" : "light"}
      className={`${headline.variable} ${body.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
