// Guardado y lectura de marcas. Las banderas de marca personal se recalculan siempre desde el historial,
// porque se puede cargar una fecha vieja o borrar una marca.
import { aliasedTable, and, asc, count, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { BestByGender, Discipline, MarkRow, NamedBest, RecentPage, SaveResult, Student } from "@shared/contracts";
import { isBetter, personalBests, rangeError } from "@shared/domain/marks";
import { todayAR } from "@shared/domain/school";
import { db, type Tx } from "../db/client";
import { disciplines, marks, students, users } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import type { SessionUser } from "../types";

export const toStudent = (s: typeof students.$inferSelect): Student => ({
  id: s.id,
  firstName: s.firstName,
  lastName: s.lastName,
  course: s.course,
  house: s.house,
  gender: s.gender,
  active: s.active,
});

export function toDiscipline(d: typeof disciplines.$inferSelect): Discipline {
  return { id: d.id, name: d.name, what: d.what, kind: d.kind, unit: d.unit, better: d.better, decimals: d.decimals, lo: d.lo, hi: d.hi, example: d.example, hint: d.hint, icon: d.icon, sort: d.sort, active: d.active };
}

export async function getDiscipline(id: string): Promise<Discipline> {
  const [d] = await db.select().from(disciplines).where(eq(disciplines.id, id)).limit(1);
  if (!d) throw notFound("La disciplina");
  return toDiscipline(d);
}

async function recomputePb(tx: Tx, studentId: string, d: Discipline) {
  const rows = await tx
    .select({ id: marks.id, value: marks.value, isPb: marks.isPb, pbDelta: marks.pbDelta })
    .from(marks)
    .where(and(eq(marks.studentId, studentId), eq(marks.disciplineId, d.id)))
    .orderBy(asc(marks.takenOn), asc(marks.createdAt), asc(marks.id));
  for (const { mark, isPb, delta } of personalBests(d, rows)) {
    if (mark.isPb !== isPb || mark.pbDelta !== delta) await tx.update(marks).set({ isPb, pbDelta: delta }).where(eq(marks.id, mark.id));
  }
}

export async function saveMarks(user: SessionUser, body: { batchId: string; disciplineId: string; takenOn: string; entries: { studentId: string; value: number | null }[] }): Promise<SaveResult> {
  const d = await getDiscipline(body.disciplineId);
  if (!d.active) throw badRequest("Esta disciplina está desactivada.");
  if (body.takenOn > todayAR()) throw badRequest("La fecha no puede ser futura.", { takenOn: "La fecha no puede ser futura." });
  const ids = body.entries.map((e) => e.studentId);
  if (new Set(ids).size !== ids.length) throw badRequest("Hay un alumno repetido en el envío.");
  for (const e of body.entries) {
    const err = e.value == null ? null : rangeError(e.value, d);
    if (err) throw badRequest(err);
  }
  return db.transaction(async (tx) => {
    const found = await tx.select().from(students).where(and(inArray(students.id, ids), eq(students.active, true)));
    if (found.length !== ids.length) throw badRequest("Hay alumnos que ya no están en la lista. Recargá la página.");
    const byId = new Map(found.map((s) => [s.id, s]));
    await tx
      .insert(marks)
      .values(body.entries.map((e) => ({ studentId: e.studentId, disciplineId: d.id, value: e.value, takenOn: body.takenOn, courseAt: byId.get(e.studentId)!.course, batchId: body.batchId, createdBy: user.id })))
      .onConflictDoNothing();
    for (const id of ids) await recomputePb(tx, id, d);
    const saved = await tx.select().from(marks).where(eq(marks.batchId, body.batchId));
    return {
      saved: saved.filter((m) => m.value != null).length,
      absent: saved.filter((m) => m.value == null).length,
      personalBests: saved.filter((m) => m.isPb).map((m) => ({ studentId: m.studentId, value: m.value!, delta: m.pbDelta! })),
    };
  });
}

export async function deleteMark(user: SessionUser, id: string) {
  const [row] = await db.select({ mark: marks, discipline: disciplines }).from(marks).innerJoin(disciplines, eq(disciplines.id, marks.disciplineId)).where(eq(marks.id, id)).limit(1);
  if (!row) throw notFound("La marca");
  if (user.role !== "admin" && row.mark.createdBy !== user.id) throw badRequest("Solo quien la cargó o un administrador puede borrar esta marca.");
  await db.transaction(async (tx) => {
    await tx.delete(marks).where(eq(marks.id, id));
    await recomputePb(tx, row.mark.studentId, toDiscipline(row.discipline));
  });
  return row.mark;
}

const author = aliasedTable(users, "author");
const markFields = {
  id: marks.id,
  studentId: marks.studentId,
  disciplineId: marks.disciplineId,
  value: marks.value,
  takenOn: marks.takenOn,
  isPb: marks.isPb,
  pbDelta: marks.pbDelta,
  courseAt: marks.courseAt,
  createdBy: marks.createdBy,
  createdByName: author.username,
};

type RawMark = { createdBy: string } & Omit<MarkRow, "canDelete">;
function present<T extends RawMark>(m: T, user: SessionUser): Omit<T, "createdBy"> & { canDelete: boolean } {
  const { createdBy, ...rest } = m;
  return { ...rest, canDelete: user.role === "admin" || createdBy === user.id };
}

/** Historial de un alumno, del más nuevo al más viejo. */
export async function marksOfStudent(user: SessionUser, studentId: string, disciplineId?: string): Promise<MarkRow[]> {
  const rows = await db
    .select(markFields)
    .from(marks)
    .innerJoin(author, eq(author.id, marks.createdBy))
    .where(disciplineId ? and(eq(marks.studentId, studentId), eq(marks.disciplineId, disciplineId)) : eq(marks.studentId, studentId))
    .orderBy(desc(marks.takenOn), desc(marks.createdAt), desc(marks.id));
  return rows.map((m) => present(m, user));
}

export async function recentMarks(user: SessionUser, filter: { disciplineId?: string; course?: string; house?: string; gender?: string; limit: number; offset: number }): Promise<RecentPage> {
  const where: SQL[] = [];
  if (filter.disciplineId) where.push(eq(marks.disciplineId, filter.disciplineId));
  if (filter.course) where.push(eq(marks.courseAt, filter.course));
  if (filter.house) where.push(eq(students.house, filter.house));
  if (filter.gender) where.push(eq(students.gender, filter.gender));
  const cond = where.length ? and(...where) : undefined;
  const [{ total }] = (await db.select({ total: count() }).from(marks).innerJoin(students, eq(students.id, marks.studentId)).where(cond)) as [{ total: number }];
  const rows = await db
    .select({ ...markFields, student: students })
    .from(marks)
    .innerJoin(students, eq(students.id, marks.studentId))
    .innerJoin(author, eq(author.id, marks.createdBy))
    .where(cond)
    .orderBy(desc(marks.createdAt), desc(marks.id))
    .limit(filter.limit)
    .offset(filter.offset);
  return { total, marks: rows.map((r) => ({ ...present(r, user), student: toStudent(r.student) })) };
}

/** Mejor marca de cada alumno en una disciplina. */
export async function bestsByStudent(d: Discipline, studentIds?: string[]) {
  const order = d.better === "hi" ? desc(marks.value) : asc(marks.value);
  const rows = await db
    .selectDistinctOn([marks.studentId], { studentId: marks.studentId, value: marks.value, takenOn: marks.takenOn })
    .from(marks)
    .where(and(eq(marks.disciplineId, d.id), isNotNull(marks.value), studentIds ? inArray(marks.studentId, studentIds) : undefined))
    .orderBy(marks.studentId, order, desc(marks.takenOn));
  return new Map(rows.map((r) => [r.studentId, { value: r.value!, takenOn: r.takenOn }]));
}

/** Mejor marca de cada curso (el actual de cada alumno) en una disciplina. */
export async function courseBests(d: Discipline): Promise<Record<string, number>> {
  const agg = d.better === "hi" ? sql<number>`max(${marks.value})` : sql<number>`min(${marks.value})`;
  const rows = await db
    .select({ course: students.course, best: agg })
    .from(marks)
    .innerJoin(students, eq(students.id, marks.studentId))
    .where(and(eq(marks.disciplineId, d.id), isNotNull(marks.value), eq(students.active, true)))
    .groupBy(students.course);
  return Object.fromEntries(rows.map((r) => [r.course, Number(r.best)]));
}

export type LoadedMark = { value: number; takenOn: string; isPb: boolean; courseAt: string; disciplineId: string; student: Student };

/** Marcas con valor para calcular estadísticas (un colegio entra de sobra en memoria). */
export async function loadMarks(filter: { disciplineId?: string; schoolYear?: number; course?: string; house?: string; gender?: string }): Promise<LoadedMark[]> {
  const where: SQL[] = [isNotNull(marks.value), eq(students.active, true)];
  if (filter.disciplineId) where.push(eq(marks.disciplineId, filter.disciplineId));
  if (filter.schoolYear) where.push(sql`${marks.takenOn} >= ${`${filter.schoolYear}-01-01`} and ${marks.takenOn} <= ${`${filter.schoolYear}-12-31`}`);
  if (filter.course) where.push(eq(marks.courseAt, filter.course));
  if (filter.house) where.push(eq(students.house, filter.house));
  if (filter.gender) where.push(eq(students.gender, filter.gender));
  const rows = await db
    .select({ value: marks.value, takenOn: marks.takenOn, isPb: marks.isPb, courseAt: marks.courseAt, disciplineId: marks.disciplineId, student: students })
    .from(marks)
    .innerJoin(students, eq(students.id, marks.studentId))
    .where(and(...where))
    .orderBy(asc(marks.takenOn), asc(marks.createdAt), asc(marks.id));
  return rows.map((r) => ({ ...r, value: r.value!, student: toStudent(r.student) }));
}

/** La mejor de cada disciplina, por separado para mujeres y hombres. */
export function bestByGender(all: LoadedMark[], list: Discipline[]): BestByGender[] {
  return list.map((d) => {
    const pick = (gender: string): NamedBest | null => {
      let best: LoadedMark | null = null;
      for (const m of all) if (m.disciplineId === d.id && m.student.gender === gender && (!best || isBetter(d, m.value, best.value))) best = m;
      return best && { value: best.value, takenOn: best.takenOn, student: best.student, courseAt: best.courseAt };
    };
    return { disciplineId: d.id, m: pick("m"), h: pick("h") };
  });
}
