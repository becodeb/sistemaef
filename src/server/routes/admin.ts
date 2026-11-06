import { Hono } from "hono";
import { asc, count, eq, sql } from "drizzle-orm";
import { createUserBody, disciplineBody, updateDisciplineBody, updateUserBody, type Discipline, type UserCreated, type UserRow } from "@shared/contracts";
import { fmtTime, fmtNumber } from "@shared/domain/marks";
import { nameKey } from "@shared/domain/names";
import { currentUser, dropSessions, requireAdmin, requireSuper } from "../auth";
import { db } from "../db/client";
import { disciplines, marks, users } from "../db/schema";
import { hashPassword, tempPassword } from "../lib/crypto";
import { badRequest, conflict, notFound, readJson } from "../lib/errors";
import { audit } from "../services/audit";
import { toDiscipline } from "../services/marks";
import type { AppEnv } from "../types";

const toRow = (u: typeof users.$inferSelect): UserRow => ({
  id: u.id,
  username: u.username,
  firstName: u.firstName,
  lastName: u.lastName,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
});

async function userOr404(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("El usuario");
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw notFound("El usuario");
  return u;
}

async function otherActiveSupers(id: string) {
  const [row] = await db.select({ n: count() }).from(users).where(sql`${users.role} = 'superadmin' and ${users.active} and ${users.id} <> ${id}`);
  return row!.n;
}

export const adminRoutes = new Hono<AppEnv>()
  // Crear usuarios y dar accesos es solo del admin general.
  .use("/users", requireSuper)
  .use("/users/*", requireSuper)
  .use("/disciplines", requireAdmin)
  .use("/disciplines/*", requireAdmin)
  .get("/users", async (c) => {
    const rows = await db.select().from(users).orderBy(asc(users.lastName), asc(users.firstName));
    return c.json(rows.map(toRow));
  })
  .post("/users", async (c) => {
    const body = await readJson(c, createUserBody);
    const username = `${body.firstName} ${body.lastName}`;
    const key = nameKey(username);
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.usernameKey, key)).limit(1);
    if (dup) throw conflict(`Ya existe el usuario «${username}».`);
    const password = body.password ?? tempPassword();
    const [row] = await db
      .insert(users)
      .values({ username, usernameKey: key, firstName: body.firstName, lastName: body.lastName, role: body.role, mustChangePassword: true, passwordHash: await hashPassword(password) })
      .returning();
    await audit(currentUser(c).id, "user_created", row!.id);
    const out: UserCreated = { user: toRow(row!), password };
    return c.json(out, 201);
  })
  .patch("/users/:id", async (c) => {
    const me = currentUser(c);
    const u = await userOr404(c.req.param("id"));
    const body = await readJson(c, updateUserBody);
    const losesSuper = u.role === "superadmin" && u.active && (body.active === false || (body.role != null && body.role !== "superadmin"));
    if (losesSuper && (await otherActiveSupers(u.id)) === 0) throw badRequest("Tiene que quedar al menos un admin general con acceso.");
    const [row] = await db.update(users).set(body).where(eq(users.id, u.id)).returning();
    // Sacarle el acceso corta sus sesiones en el momento.
    if (body.active === false) await dropSessions(u.id);
    await audit(me.id, "user_updated", u.id, body);
    return c.json(toRow(row!));
  })
  .post("/users/:id/reset-password", async (c) => {
    const u = await userOr404(c.req.param("id"));
    const password = tempPassword();
    const [row] = await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, u.id)).returning();
    await dropSessions(u.id);
    await audit(currentUser(c).id, "user_password_reset", u.id);
    const out: UserCreated = { user: toRow(row!), password };
    return c.json(out);
  })
  .get("/disciplines", async (c) => {
    const [list, counts] = await Promise.all([
      db.select().from(disciplines).orderBy(asc(disciplines.sort), asc(disciplines.name)),
      db.select({ id: marks.disciplineId, n: count() }).from(marks).groupBy(marks.disciplineId),
    ]);
    const out: Discipline[] = list.map((d) => ({ ...toDiscipline(d), markCount: counts.find((r) => r.id === d.id)?.n ?? 0 }));
    return c.json(out);
  })
  .post("/disciplines", async (c) => {
    const body = await readJson(c, disciplineBody);
    if (body.hi <= body.lo) throw badRequest("Revisá los datos ingresados.", { hi: "El máximo tiene que ser mayor que el mínimo." });
    const [dup] = await db.select({ id: disciplines.id }).from(disciplines).where(sql`lower(${disciplines.name}) = lower(${body.name})`).limit(1);
    if (dup) throw conflict("Ya hay una disciplina con ese nombre.");
    const kind = body.unit === "min" ? "ms" : "dec";
    const decimals = kind === "ms" || body.unit === "rep" || body.unit === "cm" ? 0 : body.unit === "s" ? 2 : 2;
    const mid = (body.lo + body.hi) / 2;
    const example = kind === "ms" ? fmtTime(mid) : fmtNumber(mid, decimals);
    const [row] = await db.insert(disciplines).values({ ...body, kind, decimals, example, hint: body.hint ?? null }).returning();
    await audit(currentUser(c).id, "discipline_created", row!.id);
    return c.json(toDiscipline(row!), 201);
  })
  .patch("/disciplines/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("La disciplina");
    const body = await readJson(c, updateDisciplineBody);
    const [row] = await db.update(disciplines).set(body).where(eq(disciplines.id, id)).returning();
    if (!row) throw notFound("La disciplina");
    if (row.hi <= row.lo) throw badRequest("Revisá los datos ingresados.", { hi: "El máximo tiene que ser mayor que el mínimo." });
    await audit(currentUser(c).id, "discipline_updated", id, { fields: Object.keys(body) });
    return c.json(toDiscipline(row));
  });
