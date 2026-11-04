import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

// แยกระบบด้วย path (4/11/2026): ลิงก์ / bookmark เดิมพาไปหน้าใหม่ (คง query string เดิม)
const DASH = ["facebook-page", "facebook-ads", "google-ads", "line-oa", "website", "performance", "import", "export"];
const WORK = ["leads", "buyer-leads", "seller-leads", "developers", "sale-developer", "home-builders", "sale-home-builder"];
const moved = [...DASH.map((p) => [p, "dashboard"]), ...WORK.map((p) => [p, "work"])].flatMap(([p, sys]) => [
  { source: `/${p}`, destination: `/${sys}/${p}`, permanent: false },
  { source: `/${p}/:rest*`, destination: `/${sys}/${p}/:rest*`, permanent: false },
]);

// Revenue ย้ายไปอยู่ในระบบบัญชี (5/11/2026): /sales (เดิม) และ /work/sales ไปที่ /account/revenue
moved.push(
  { source: "/sales", destination: "/account/revenue", permanent: false }, { source: "/sales/:rest*", destination: "/account/revenue/:rest*", permanent: false },
  { source: "/work/sales", destination: "/account/revenue", permanent: false }, { source: "/work/sales/:rest*", destination: "/account/revenue/:rest*", permanent: false },
);

const nextConfig: NextConfig = {
  async redirects() { return moved; },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};
export default nextConfig;
