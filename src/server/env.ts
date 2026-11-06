// Configuración validada: el proceso no arranca con un entorno inválido.
import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Origen público: cookies Secure y control de origen en las mutaciones. */
  PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  /** Detrás de Traefik/Cloudflare: creer en X-Forwarded-For / CF-Connecting-IP. */
  TRUST_PROXY: bool.default(false),
  /** Crean la primera cuenta (admin general) si la base no tiene usuarios; al entrar pide cambiar la contraseña. */
  ADMIN_USERNAME: z.string().trim().min(1).default("Admin General"),
  ADMIN_PASSWORD: z.string().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  // API_PORT gana sobre PORT para no chocar con herramientas de desarrollo que exportan PORT.
  const parsed = schema.safeParse({ ...process.env, PORT: process.env.API_PORT ?? process.env.PORT });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.PUBLIC_URL);
    if (!env.PUBLIC_URL.startsWith("https://") && !local) throw new Error("PUBLIC_URL debe usar https en producción");
  }
  return env;
}

export const env = load();
export const isProd = env.NODE_ENV === "production";
export const secureCookies = env.PUBLIC_URL.startsWith("https://");
