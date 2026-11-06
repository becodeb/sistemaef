import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createApp } from "@server/app";
import { ensureDisciplines } from "@server/db/bootstrap";
import { db } from "@server/db/client";
import { disciplines, users } from "@server/db/schema";
import { hashPassword } from "@server/lib/crypto";
import { nameKey } from "@shared/domain/names";

const app = createApp();

export async function resetDb() {
  await db.execute(sql`truncate audit_logs, goals, marks, students, sessions, users, disciplines restart identity cascade`);
  await ensureDisciplines();
}

export type Agent = { cookie: string };
export const anon = (): Agent => ({ cookie: "" });

export async function call<T = any>(agent: Agent, method: string, url: string, body?: unknown): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await app.request(`/api${url}`, {
    method,
    headers: { "content-type": "application/json", "x-record-client": "1", cookie: agent.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) agent.cookie = set.split(";")[0]!;
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T, headers: res.headers };
}

export async function newUser(name: string, role: "admin" | "teacher" = "teacher", opts: { mustChange?: boolean; password?: string } = {}) {
  const [first, ...rest] = name.split(" ");
  const password = opts.password ?? "contraseña-inicial";
  await db.insert(users).values({ username: name, usernameKey: nameKey(name), firstName: first!, lastName: rest.join(" "), role, mustChangePassword: opts.mustChange ?? false, passwordHash: await hashPassword(password) });
  const agent = anon();
  const res = await call(agent, "POST", "/auth/login", { username: name, password });
  if (res.status !== 200) throw new Error(`login falló: ${res.status}`);
  return agent;
}

export async function disciplineId(name: string) {
  const [d] = await db.select({ id: disciplines.id }).from(disciplines).where(eq(disciplines.name, name));
  return d!.id;
}

export async function newStudent(admin: Agent, firstName: string, lastName: string, course = "6ES", house = "earth", gender: string | null = "m") {
  const res = await call(admin, "POST", "/students", { firstName, lastName, course, house, gender });
  if (res.status !== 201) throw new Error(`alta falló: ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

export const save = (agent: Agent, disciplineIdValue: string, takenOn: string, entries: { studentId: string; value: number | null }[], batchId = randomUUID()) =>
  call(agent, "POST", "/marks", { batchId, disciplineId: disciplineIdValue, takenOn, entries });
