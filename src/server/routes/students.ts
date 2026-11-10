import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import { goalBody, importBody, studentBody, updateStudentBody, type ImportResult, type ImportRowResult, type Profile, type Roster, type StudentContext } from "@shared/contracts";
import { groupByKey } from "@shared/domain/school";
import { nameKey } from "@shared/domain/names";
import { currentUser, requireAdmin } from "../auth";
import { db } from "../db/client";
import { disciplines, goals, students } from "../db/schema";
import { badRequest, conflict, notFound, readJson } from "../lib/errors";
import { audit } from "../services/audit";
import { bestsByStudent, courseBests, getDiscipline, marksOfStudent, toStudent } from "../services/marks";
import type { AppEnv } from "../types";

const LIST_ORDER = [asc(students.lastName), asc(students.firstName)];

async function studentOr404(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("El alumno");
  const [s] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!s) throw notFound("El alumno");
  return s;
}

/** Filtra por sexo; «sin» son los que todavía no lo tienen definido. */
const genderCond = (gender?: string) => (gender === "sin" ? sql`${students.gender} is null` : gender ? eq(students.gender, gender) : undefined);

export const studentRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const { course, house, gender, inactive } = c.req.query();
    const rows = await db
      .select()
      .from(students)
      .where(and(inactive === "1" ? undefined : eq(students.active, true), course ? eq(students.course, course) : undefined, house ? eq(students.house, house) : undefined, genderCond(gender)))
      .orderBy(...LIST_ORDER);
    return c.json(rows.map(toStudent));
  })
  .get("/:id/profile", async (c) => {
    const user = currentUser(c);
    const s = await studentOr404(c.req.param("id"));
    const [all, goalRows, list] = await Promise.all([
      marksOfStudent(user, s.id),
      db.select().from(goals).where(eq(goals.studentId, s.id)),
      db.select({ id: disciplines.id }).from(disciplines).orderBy(asc(disciplines.sort), asc(disciplines.name)),
    ]);
    const body: Profile = {
      student: toStudent(s),
      disciplines: list.map(({ id }) => ({ disciplineId: id, marks: all.filter((m) => m.disciplineId === id), goal: goalRows.find((g) => g.disciplineId === id)?.target ?? null })),
    };
    return c.json(body);
  })
  .get("/:id/context", async (c) => {
    const user = currentUser(c);
    const s = await studentOr404(c.req.param("id"));
    const d = await getDiscipline(c.req.query("disciplineId") ?? "00000000-0000-0000-0000-000000000000");
    const [list, bests, course] = await Promise.all([marksOfStudent(user, s.id, d.id), bestsByStudent(d, [s.id]), courseBests(d)]);
    const body: StudentContext = { best: bests.get(s.id) ?? null, courseBest: course[s.course] ?? null, marks: list.slice(0, 4), total: list.filter((m) => m.value != null).length };
    return c.json(body);
  })
  .put("/:id/goals/:disciplineId", requireAdmin, async (c) => {
    const user = currentUser(c);
    const s = await studentOr404(c.req.param("id"));
    const d = await getDiscipline(c.req.param("disciplineId"));
    const { target } = await readJson(c, goalBody);
    if (target == null) await db.delete(goals).where(and(eq(goals.studentId, s.id), eq(goals.disciplineId, d.id)));
    else
      await db
        .insert(goals)
        .values({ studentId: s.id, disciplineId: d.id, target, setBy: user.id })
        .onConflictDoUpdate({ target: [goals.studentId, goals.disciplineId], set: { target, setBy: user.id, updatedAt: new Date() } });
    return c.json({ ok: true });
  })
  .post("/", requireAdmin, async (c) => {
    const body = await readJson(c, studentBody);
    const key = nameKey(`${body.firstName} ${body.lastName}`);
    const [dup] = await db.select({ id: students.id }).from(students).where(and(eq(students.nameKey, key), eq(students.course, body.course), eq(students.active, true))).limit(1);
    if (dup) throw conflict("Ya hay un alumno con ese nombre en ese curso.");
    const [row] = await db.insert(students).values({ ...body, nameKey: key }).returning();
    await audit(currentUser(c).id, "student_created", row!.id);
    return c.json(toStudent(row!), 201);
  })
  .patch("/:id", requireAdmin, async (c) => {
    const s = await studentOr404(c.req.param("id"));
    const body = await readJson(c, updateStudentBody);
    const next = { ...s, ...body };
    const key = nameKey(`${next.firstName} ${next.lastName}`);
    if (next.active) {
      const [dup] = await db.select({ id: students.id }).from(students).where(and(eq(students.nameKey, key), eq(students.course, next.course), eq(students.active, true), sql`${students.id} <> ${s.id}`)).limit(1);
      if (dup) throw conflict("Ya hay un alumno con ese nombre en ese curso.");
    }
    const [row] = await db.update(students).set({ ...body, nameKey: key, updatedAt: new Date() }).where(eq(students.id, s.id)).returning();
    await audit(currentUser(c).id, "student_updated", s.id, { fields: Object.keys(body) });
    return c.json(toStudent(row!));
  })
  .post("/import", requireAdmin, async (c) => {
    const { rows, dryRun } = await readJson(c, importBody);
    const existing = await db.select().from(students).where(eq(students.active, true));
    const byKey = new Map<string, (typeof existing)[number][]>();
    for (const s of existing) byKey.set(s.nameKey, [...(byKey.get(s.nameKey) ?? []), s]);

    const results: ImportRowResult[] = [];
    const inserts: (typeof students.$inferInsert)[] = [];
    const updates: { id: string; course: string; house: string; gender: string | null }[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const key = nameKey(`${r.firstName} ${r.lastName}`);
      const name = `${r.lastName}, ${r.firstName}`;
      if (seen.has(`${key}|${r.course}`)) {
        results.push({ line: r.line, action: "ambiguous", name, detail: "Está repetido en la lista." });
        continue;
      }
      seen.add(`${key}|${r.course}`);
      const same = byKey.get(key) ?? [];
      // Con el mismo nombre en más de un curso solo se toca el del curso indicado: si no, podría ser otra persona.
      const match = same.length === 1 ? same[0] : same.find((s) => s.course === r.course);
      if (!match && same.length > 1) {
        results.push({ line: r.line, action: "ambiguous", name, detail: `Hay ${same.length} alumnos con ese nombre y ninguno en ${r.course}.` });
      } else if (!match) {
        inserts.push({ firstName: r.firstName, lastName: r.lastName, nameKey: key, course: r.course, house: r.house, gender: r.gender });
        results.push({ line: r.line, action: "create", name });
      } else {
        // Un sexo vacío en la lista no borra el que ya estaba definido.
        const gender = r.gender ?? match.gender;
        const changes = [match.course !== r.course && `curso ${match.course} → ${r.course}`, match.house !== r.house && `house ${match.house} → ${r.house}`, match.gender !== gender && "sexo"].filter(Boolean);
        if (changes.length) {
          updates.push({ id: match.id, course: r.course, house: r.house, gender });
          results.push({ line: r.line, action: "update", name, detail: changes.join(", ") });
        } else results.push({ line: r.line, action: "same", name });
      }
    }
    if (!dryRun) {
      await db.transaction(async (tx) => {
        if (inserts.length) await tx.insert(students).values(inserts);
        for (const u of updates) await tx.update(students).set({ course: u.course, house: u.house, gender: u.gender, updatedAt: new Date() }).where(eq(students.id, u.id));
      });
      await audit(currentUser(c).id, "students_imported", undefined, { created: inserts.length, updated: updates.length });
    }
    const countOf = (action: ImportRowResult["action"]) => results.filter((r) => r.action === action).length;
    const body: ImportResult = { dryRun, created: countOf("create"), updated: countOf("update"), same: countOf("same"), ambiguous: countOf("ambiguous"), rows: results.filter((r) => r.action !== "same") };
    return c.json(body);
  });

export const rosterRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const { group: groupKey, gender, disciplineId } = c.req.query();
  const group = groupByKey(groupKey);
  if (!group) throw badRequest("Elegí un curso o un house.");
  const d = await getDiscipline(disciplineId ?? "00000000-0000-0000-0000-000000000000");
  const rows = await db
    .select()
    .from(students)
    .where(and(eq(students.active, true), group.course ? eq(students.course, group.course) : undefined, group.house ? eq(students.house, group.house) : undefined, genderCond(gender)))
    .orderBy(...LIST_ORDER);
  const [bests, courseBest] = await Promise.all([bestsByStudent(d), courseBests(d)]);
  const body: Roster = { students: rows.map((s) => ({ ...toStudent(s), best: bests.get(s.id) ?? null })), courseBest };
  return c.json(body);
});
