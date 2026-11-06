// Sesión de los profes: cookie httpOnly con un token cuyo hash vive en la base.
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, gt, ne } from "drizzle-orm";
import type { Me } from "@shared/contracts";
import { db } from "./db/client";
import { sessions, users } from "./db/schema";
import { secureCookies } from "./env";
import { randomToken, sha256 } from "./lib/crypto";
import { HttpError, forbidden } from "./lib/errors";
import type { AppEnv, SessionUser } from "./types";

export const SESSION_COOKIE = "rec_s";
const TTL_MS = 14 * 24 * 60 * 60_000;

export async function startSession(c: Context, userId: string) {
  const token = randomToken();
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + TTL_MS) });
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: secureCookies, sameSite: "Lax", path: "/", maxAge: TTL_MS / 1000 });
}

export async function endSession(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Cierra las demás sesiones del usuario, o todas si no se indica cuál conservar. */
export async function dropSessions(userId: string, keepToken?: string) {
  const where = keepToken ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, sha256(keepToken))) : eq(sessions.userId, userId);
  await db.delete(sessions).where(where);
}

export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const hash = sha256(token);
    const [row] = await db
      .select({ user: users, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
      .limit(1);
    if (row) {
      c.set("user", row.user);
      // Renueva cuando le queda menos de la mitad, para no escribir en cada pedido.
      if (row.expiresAt.getTime() - Date.now() < TTL_MS / 2) {
        await db.update(sessions).set({ expiresAt: new Date(Date.now() + TTL_MS) }).where(eq(sessions.tokenHash, hash));
        setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: secureCookies, sameSite: "Lax", path: "/", maxAge: TTL_MS / 1000 });
      }
    }
  }
  await next();
};

export function currentUser(c: Context<AppEnv>): SessionUser {
  const user = c.get("user");
  if (!user) throw new HttpError(401, "Tu sesión terminó. Volvé a entrar.", "unauthorized");
  return user;
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = currentUser(c);
  if (user.mustChangePassword) throw new HttpError(403, "Tenés que cambiar tu contraseña para seguir.", "must_change_password");
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (currentUser(c).role !== "admin") throw forbidden("Solo un administrador puede hacer esto.");
  await next();
};

export const toMe = (u: SessionUser): Me => ({ id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role, mustChangePassword: u.mustChangePassword });
