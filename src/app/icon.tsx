import { ImageResponse } from "next/og";

// The brand mark as an app icon, at the two sizes installers ask for.
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const side = Number(await id);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05291e",
          color: "#ffffff",
          fontSize: side * 0.42,
          fontWeight: 700,
          letterSpacing: "-0.08em",
        }}
      >
        mn
      </div>
    ),
    { width: side, height: side },
  );
}
