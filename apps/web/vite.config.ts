import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      port: 5173,
    },
    define: {
      __APP_NAME__: JSON.stringify(env.VITE_APP_NAME || "研录教学管理中台"),
    },
  };
});

