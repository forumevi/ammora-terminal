import { ImageResponse } from "next/og";

export const alt = "Ammora Terminal — launchpad & exchange on GIWA, built on the Ammora SDK";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(circle at 15% 10%, rgba(52,245,197,0.25), transparent 45%), radial-gradient(circle at 95% 0%, rgba(91,140,255,0.3), transparent 50%), #06080b", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, border: "3px solid #34f5c5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "#34f5c5" }}>Λ</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Ammora Terminal</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>Launch on a bonding curve.</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, color: "#34f5c5" }}>Graduate into real liquidity.</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#9aa4b2" }}>
          <span>@ammora-protocol/sdk 0.3.9</span><span>·</span><span>GIWA Sepolia</span><span>·</span><span>V4 ALC curves → ARL pools</span>
        </div>
      </div>
    ),
    size,
  );
}
