import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

const fileEnv = loadEnv("test", process.cwd(), "");
const testDb = process.env.DATABASE_URL_TEST ?? fileEnv.DATABASE_URL_TEST ?? "";
const alias = {
  "@shared": path.resolve(__dirname, "src/shared"),
  "@server": path.resolve(__dirname, "src/server"),
  "@client": path.resolve(__dirname, "src/client"),
};

export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Una sola base compartida: los archivos corren de a uno.
          fileParallelism: false,
          setupFiles: ["tests/integration/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: { NODE_ENV: "test", DATABASE_URL: testDb, PUBLIC_URL: "http://localhost:5173" },
        },
      },
    ],
  },
});
