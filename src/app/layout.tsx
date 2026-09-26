import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
/**
 * One typeface for everything, with tabular figures so every column of money
 * aligns. It goes through next/font, which downloads it at build time and
 * serves it from our own origin: `font-src 'self'` in http-security.ts forbids
 * font hosts, and widening the CSP for a typeface is not a trade worth making.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex",
});
export const metadata: Metadata = {
  title: { default: "MyNAB", template: "%s · MyNAB" },
  description: "A self-hosted envelope budget.",
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const dark = jar.get("mynab-theme")?.value === "dark";
  const hideAmounts = jar.get("mynab-hide-amounts")?.value === "1";
  return (
    <html
      lang="en"
      data-theme={dark ? "dark" : "light"}
      data-hide-amounts={hideAmounts ? "" : undefined}
      className={sans.variable}
    >
      <body>{children}</body>
    </html>
  );
}
