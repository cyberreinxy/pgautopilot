import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const singleReact = {
  react: path.resolve(rootDir, "node_modules/react"),
  "react-dom": path.resolve(rootDir, "node_modules/react-dom"),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: singleReact,
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
