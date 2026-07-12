/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@google-cloud/storage",
    "@google/genai"
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "connect-src 'self'",
              "font-src 'self' data:",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "img-src 'self' data: blob:",
              "object-src 'none'",
              `script-src 'self' 'unsafe-inline'${
                process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
              }`,
              "style-src 'self' 'unsafe-inline'",
              "worker-src 'self' blob:"
            ].join("; ")
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" }
        ]
      }
    ];
  }
};

export default nextConfig;
