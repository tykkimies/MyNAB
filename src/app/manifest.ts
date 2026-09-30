import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Lets a phone add MyNAB to its home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyNAB",
    short_name: "MyNAB",
    description: "A self-hosted envelope budget.",
    id: `${base}/budget`,
    start_url: `${base}/budget`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
    icons: [
      { src: `${base}/icon/192`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon/512`, sizes: "512x512", type: "image/png" },
      {
        src: `${base}/icon/512`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Add transaction", url: `${base}/add` },
      { name: "Budget", url: `${base}/budget` },
    ],
  };
}
