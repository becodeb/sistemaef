import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { changePasswordBody, loginBody } from "@shared/contracts";
import { nameKey } from "@shared/domain/names";
import { SESSION_COOKIE, currentUser, dropSessions, endSession, startSession, toMe } from "../auth";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { HttpError, badRequest, readJson, tooMany } from "../lib/errors";
import { hit } from "../lib/rate-limit";
import { clientIp } from "../lib/request";
import { audit } from "../services/audit";
import type { AppEnv } from "../types";

// Se verifica igual aunque el usuario no exista, para que el tiempo de respuesta no lo delate.
const dummyHash = hashPassword("usuario-inexistente");

export const authRoutes = new Hono<AppEnv>()
  .post("/login", async (c) => {
    const body = await readJson(c, loginBody);
    const key = nameKey(body.username);
    const ip = clientIp(c);
    if (!hit(`login:${ip}:${key}`, 8, 15 * 60_000) || !hit(`login-ip:${ip}`, 40, 15 * 60_000)) throw tooMany("Demasiados intentos. Esperá unos minutos y volvé a probar.");
    const [user] = await db.select().from(users).where(eq(users.usernameKey, key)).limit(1);
    const valid = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !valid) throw new HttpError(401, "El usuario o la contraseña no son correctos.", "invalid_login");
    if (!user.active) throw new HttpError(403, "Tu acceso está desactivado. Hablá con un administrador.", "disabled");
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await startSession(c, user.id);
    return c.json(toMe(user));
  })
  .post("/logout", async (c) => {
    await endSession(c);
    return c.json({ ok: true });
  })
  .get("/me", (c) => c.json(toMe(currentUser(c))))
  .post("/change-password", async (c) => {
    const user = currentUser(c);
    const body = await readJson(c, changePasswordBody);
    if (!hit(`pw:${user.id}`, 10, 15 * 60_000)) throw tooMany();
    if (!(await verifyPassword(body.current, user.passwordHash))) throw badRequest("Revisá los datos ingresados.", { current: "La contraseña actual no es correcta." });
    if (body.next === body.current) throw badRequest("Revisá los datos ingresados.", { next: "La nueva tiene que ser distinta de la actual." });
    await db.update(users).set({ passwordHash: await hashPassword(body.next), mustChangePassword: false }).where(eq(users.id, user.id));
    await dropSessions(user.id, getCookie(c, SESSION_COOKIE));
    await audit(user.id, "password_changed", user.id);
    return c.json(toMe({ ...user, mustChangePassword: false }));
  });
