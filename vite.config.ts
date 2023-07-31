import { defineConfig } from "vite";
//import reactRefresh from "@vitejs/plugin-react-refresh";

export default defineConfig({
  plugins: [], //[reactRefresh()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: "./src/index.ts",
    },
  },
});
