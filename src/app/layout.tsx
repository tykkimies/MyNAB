import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
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
    <html lang="en" data-theme={dark ? "dark" : "light"}>
      <body>{children}</body>
    </html>
  );
}
