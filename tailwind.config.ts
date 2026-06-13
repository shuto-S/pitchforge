import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        muted: "#62615c",
        paper: "#f7f3ea",
        panel: "#fffdf7",
        line: "#ded8cb",
        forge: "#e85d2a",
        cloud: "#2d7ff9",
        gemini: "#7759f4"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(23, 23, 23, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
