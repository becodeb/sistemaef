import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadUser, requireUser } from "./auth";
import { db, pingDb } from "./db/client";
import { disciplines } from "./db/schema";
import { HttpError, onError } from "./lib/errors";
import { log } from "./lib/logger";
import { sameOriginMutations, securityHeaders } from "./lib/security";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { markRoutes } from "./routes/marks";
import { statsRoutes } from "./routes/stats";
import { rosterRoutes, studentRoutes } from "./routes/students";
import { toDiscipline } from "./services/marks";
import type { AppEnv } from "./types";

export function defaultStaticDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
}

export function createApp(opts: { staticDir?: string | null } = {}) {
  const app = new Hono<AppEnv>();
  app.use("*", securityHeaders);
  app.use("*", compress());
  app.onError(onError);

  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    if (!c.req.path.endsWith("/health")) log.info("request", { method: c.req.method, path: c.req.routePath, status: c.res.status, ms: Math.round(performance.now() - started) });
  });
  api.use("*", sameOriginMutations);
  api.use(
    "*",
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: () => {
        throw new HttpError(413, "Los datos enviados son demasiado grandes.", "too_large");
      },
    }),
  );
  api.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });
  api.get("/health", async (c) => {
    const ok = await pingDb();
    return c.json({ ok }, ok ? 200 : 503);
  });
  api.use("*", loadUser);
  api.route("/auth", authRoutes);

  // De acá en adelante hay que haber entrado y haber cambiado la contraseña inicial.
  api.use("*", requireUser);
  api.get("/disciplines", async (c) => {
    const rows = await db.select().from(disciplines).where(eq(disciplines.active, true)).orderBy(asc(disciplines.sort), asc(disciplines.name));
    return c.json(rows.map(toDiscipline));
  });
  api.route("/students", studentRoutes);
  api.route("/roster", rosterRoutes);
  api.route("/marks", markRoutes);
  api.route("/stats", statsRoutes);
  api.route("/admin", adminRoutes);
  api.all("*", () => {
    throw new HttpError(404, "No encontramos lo que buscabas.", "not_found");
  });

  app.route("/api", api);

  if (opts.staticDir) {
    const dir = opts.staticDir;
    const root = path.relative(process.cwd(), dir);
    const index = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    app.use(
      "/assets/*",
      serveStatic({
        root,
        onFound: (_p, c) => {
          c.header("Cache-Control", "public, max-age=31536000, immutable");
        },
      }),
    );
    app.use("*", serveStatic({ root }));
    // Cualquier otra ruta es de la app de una sola página.
    app.get("*", (c) => {
      c.header("Cache-Control", "no-store");
      return c.html(index);
    });
  }
  return app;
}
