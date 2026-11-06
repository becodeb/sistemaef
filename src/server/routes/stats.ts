import { Hono } from "hono";
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";
import type { Coverage, Dashboard, DisciplineCards, Evolution, HistoricRecords, Progress, Rankings } from "@shared/contracts";
import { COURSES, todayAR } from "@shared/domain/school";
import { isBetter } from "@shared/domain/marks";
import { requireAdmin } from "../auth";
import { db } from "../db/client";
import { disciplines, marks, students } from "../db/schema";
import { bestByGender, getDiscipline, loadMarks, toDiscipline, toStudent } from "../services/marks";
import { houseStandings, monthlyEvolution, progressRows, ranking } from "../services/stats";
import type { AppEnv } from "../types";

const currentYear = () => Number(todayAR().slice(0, 4));
const NO_ID = "00000000-0000-0000-0000-000000000000";

async function schoolYears(): Promise<number[]> {
  const rows = await db.selectDistinct({ y: sql<number>`extract(year from ${marks.takenOn})::int` }).from(marks);
  return [...new Set([currentYear(), ...rows.map((r) => Number(r.y))])].sort((a, b) => b - a);
}
const activeDisciplines = async () => (await db.select().from(disciplines).where(eq(disciplines.active, true)).orderBy(asc(disciplines.sort), asc(disciplines.name))).map(toDiscipline);
const yearParam = (raw?: string) => (raw === "todos" ? undefined : Number(raw) || currentYear());
const filters = (q: Record<string, string>) => ({ course: q.course || undefined, house: q.house || undefined, gender: q.gender || undefined });

export const statsRoutes = new Hono<AppEnv>()
  .use("*", requireAdmin)
  .get("/dashboard", async (c) => {
    const schoolYear = Number(c.req.query("schoolYear")) || currentYear();
    const list = await activeDisciplines();
    const [all, [studentRow], years, highlights] = await Promise.all([
      loadMarks({ schoolYear }),
      db.select({ n: count() }).from(students).where(eq(students.active, true)),
      schoolYears(),
      db
        .select({ student: students, disciplineId: marks.disciplineId, value: marks.value, delta: marks.pbDelta, takenOn: marks.takenOn })
        .from(marks)
        .innerJoin(students, eq(students.id, marks.studentId))
        .where(and(eq(marks.isPb, true), eq(students.active, true), sql`extract(year from ${marks.takenOn})::int = ${schoolYear}`))
        .orderBy(sql`${marks.takenOn} desc`, sql`${marks.createdAt} desc`)
        .limit(5),
    ]);
    const body: Dashboard = {
      schoolYear,
      schoolYears: years,
      students: studentRow!.n,
      disciplines: list.length,
      results: all.length,
      personalBests: all.filter((m) => m.isPb).length,
      bestOfYear: bestByGender(all, list),
      highlights: highlights.map((h) => ({ student: toStudent(h.student), disciplineId: h.disciplineId, value: h.value!, delta: h.delta!, takenOn: h.takenOn })),
    };
    return c.json(body);
  })
  .get("/evolution", async (c) => {
    const q = c.req.query();
    const body: Evolution = { points: monthlyEvolution(await loadMarks({ disciplineId: q.disciplineId ?? NO_ID, schoolYear: yearParam(q.schoolYear), ...filters(q) })) };
    return c.json(body);
  })
  .get("/coverage", async (c) => {
    const q = c.req.query();
    const year = Number(q.schoolYear) || currentYear();
    const [counts, withMark] = await Promise.all([
      db.select({ course: students.course, n: count() }).from(students).where(eq(students.active, true)).groupBy(students.course),
      db
        .select({ course: students.course, n: sql<number>`count(distinct ${students.id})::int` })
        .from(marks)
        .innerJoin(students, eq(students.id, marks.studentId))
        .where(and(eq(marks.disciplineId, q.disciplineId ?? NO_ID), eq(students.active, true), isNotNull(marks.value), sql`extract(year from ${marks.takenOn})::int = ${year}`))
        .groupBy(students.course),
    ]);
    const body: Coverage = { rows: COURSES.map((course) => ({ course, students: counts.find((r) => r.course === course)?.n ?? 0, withMark: withMark.find((r) => r.course === course)?.n ?? 0 })) };
    return c.json(body);
  })
  .get("/rankings", async (c) => {
    const q = c.req.query();
    const d = await getDiscipline(q.disciplineId ?? NO_ID);
    const all = await loadMarks({ disciplineId: d.id, schoolYear: yearParam(q.schoolYear), ...filters(q) });
    const body: Rankings = { rows: ranking(d, all), houses: houseStandings(d, all), schoolYears: await schoolYears() };
    return c.json(body);
  })
  .get("/records", async (c) => {
    const [all, list] = await Promise.all([loadMarks({}), activeDisciplines()]);
    const body: HistoricRecords = { records: bestByGender(all, list) };
    return c.json(body);
  })
  .get("/discipline-cards", async (c) => {
    const q = c.req.query();
    const [list, all] = await Promise.all([activeDisciplines(), loadMarks({ schoolYear: yearParam(q.schoolYear), ...filters(q) })]);
    const body: DisciplineCards = {
      cards: list.map((d) => {
        const own = all.filter((m) => m.disciplineId === d.id);
        let best: number | null = null;
        for (const m of own) if (best == null || isBetter(d, m.value, best)) best = m.value;
        return { disciplineId: d.id, count: own.length, best };
      }),
    };
    return c.json(body);
  })
  .get("/progress", async (c) => {
    const q = c.req.query();
    const d = await getDiscipline(q.disciplineId ?? NO_ID);
    const all = await loadMarks({ disciplineId: d.id, schoolYear: yearParam(q.schoolYear), ...filters(q) });
    const body: Progress = { rows: progressRows(d, all), evolution: monthlyEvolution(all), schoolYears: await schoolYears() };
    return c.json(body);
  });
