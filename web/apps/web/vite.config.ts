import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const singleReact = {
  react: path.resolve(rootDir, "node_modules/react"),
  "react-dom": path.resolve(rootDir, "node_modules/react-dom"),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: singleReact,
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
