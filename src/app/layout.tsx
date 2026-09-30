import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { isPhone } from "@/infrastructure/view";
import { selectedTheme, themeChrome } from "@/infrastructure/theme";
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
  // Opened from the home screen, iOS runs it full screen like an app.
  appleWebApp: { capable: true, title: "MyNAB", statusBarStyle: "default" },
};
/**
 * `viewport-fit=cover` makes iOS report the notch and home-indicator insets
 * that the phone bars pad by; the status bar takes the theme's canvas.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = selectedTheme((await cookies()).get("mynab-theme")?.value);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: themeChrome(theme),
  };
}
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const theme = selectedTheme(jar.get("mynab-theme")?.value);
  const hideAmounts = jar.get("mynab-hide-amounts")?.value === "1";
  const phone = await isPhone();
  return (
    <html
      lang="en"
      data-theme={theme}
      data-hide-amounts={hideAmounts ? "" : undefined}
      data-view={phone ? "phone" : undefined}
      className={sans.variable}
    >
      <body>{children}</body>
    </html>
  );
}
