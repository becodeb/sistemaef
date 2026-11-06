import { serve } from "@hono/node-server";
import { createApp, defaultStaticDir } from "./app";
import { ensureAdmin, ensureDisciplines } from "./db/bootstrap";
import { sqlClient } from "./db/client";
import { runMigrations } from "./db/migrate";
import { env, isProd } from "./env";
import { errorFields, log } from "./lib/logger";

async function main() {
  await runMigrations();
  await ensureDisciplines();
  await ensureAdmin();
  const app = createApp({ staticDir: isProd ? defaultStaticDir() : null });
  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
    log.info("server_started", { port: info.port, env: env.NODE_ENV });
  });

  const shutdown = (signal: string) => {
    log.info("shutdown", { signal });
    server.close();
    setTimeout(async () => {
      await sqlClient.end({ timeout: 5 });
      process.exit(0);
    }, 2000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (err) => log.error("unhandled_rejection", errorFields(err)));

main().catch((err) => {
  log.error("startup_failed", errorFields(err));
  process.exit(1);
});
