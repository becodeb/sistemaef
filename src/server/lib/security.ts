import type { MiddlewareHandler } from "hono";
import { env, isProd, secureCookies } from "../env";
import { forbidden } from "./errors";

const allowedOrigin = new URL(env.PUBLIC_URL).origin;

/**
 * CSRF: los navegadores siempre mandan Origin en POST/PUT/PATCH/DELETE entre sitios, así que
 * se rechaza lo que no venga de nuestro origen. Se combina con cookies SameSite=Lax y cuerpos JSON.
 */
export const sameOriginMutations: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = c.req.header("origin");
    const devOk = !isProd && origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (origin && origin !== allowedOrigin && !devOk) throw forbidden("Solicitud bloqueada por seguridad (origen no permitido).");
    if (!origin && c.req.header("x-record-client") !== "1") throw forbidden("Solicitud bloqueada por seguridad.");
  }
  await next();
};

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  // Datos de menores: que los buscadores no indexen nada.
  h.set("X-Robots-Tag", "noindex, nofollow");
  if (isProd && secureCookies) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if ((h.get("content-type") ?? "").includes("text/html")) {
    h.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        // Cloudflare Web Analytics lo inyecta la zona (becode.com.ar).
        "script-src 'self' https://static.cloudflareinsights.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://cloudflareinsights.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        ...(secureCookies ? ["upgrade-insecure-requests"] : []),
      ].join("; "),
    );
  }
};
