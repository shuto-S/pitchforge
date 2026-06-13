/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@google-cloud/firestore",
    "@google-cloud/storage",
    "@google/genai"
  ]
};

export default nextConfig;
