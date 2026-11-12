import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: [
    "playwright",
    "lighthouse",
    "pdfkit",
    "pg",
    "@prisma/adapter-pg",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Deliverable previews are intentionally framed by the app and must not
        // carry the global frame-deny header. They set their own CSP instead.
        source: "/((?!preview/).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
