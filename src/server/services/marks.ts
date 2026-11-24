// Guardado y lectura de marcas. Las banderas de marca personal se recalculan siempre desde el historial,
// porque se puede cargar una fecha vieja o borrar una marca.
import { aliasedTable, and, asc, count, desc, eq, exists, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { MAX_DELETE, type BestByGender, type Discipline, type JumpHistory, type MarkRow, type NamedBest, type RecentPage, type SaveResult, type Student } from "@shared/contracts";
import { attemptsError, marksFrom, type JumpAttempt } from "@shared/domain/heights";
import { isBetter, personalBests, rangeError } from "@shared/domain/marks";
import { isAdmin } from "@shared/domain/roles";
import { fullName } from "@shared/domain/names";
import { GRAD, todayAR } from "@shared/domain/school";
import { db, type Tx } from "../db/client";
import { disciplines, jumpAttempts, marks, students, users } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import type { SessionUser } from "../types";
import { coursesOn } from "./promotion";

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
  return { id: d.id, name: d.name, what: d.what, kind: d.kind, unit: d.unit, better: d.better, decimals: d.decimals, lo: d.lo, hi: d.hi, example: d.example, hint: d.hint, icon: d.icon, sort: d.sort, heights: d.heights, active: d.active };
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

async function batchResult(tx: Tx, batchId: string): Promise<SaveResult> {
  const saved = await tx.select().from(marks).where(eq(marks.batchId, batchId));
  return {
    saved: saved.filter((m) => m.value != null).length,
    absent: saved.filter((m) => m.value == null).length,
    personalBests: saved.filter((m) => m.isPb).map((m) => ({ studentId: m.studentId, value: m.value!, delta: m.pbDelta! })),
  };
}

/** El curso que tenía cada uno al tomarse la marca. A quien ya había egresado no se le cargan marcas. */
async function coursesForMarks(tx: Tx, list: (typeof students.$inferSelect)[], takenOn: string) {
  const courses = await coursesOn(tx, list, takenOn);
  const grad = list.find((s) => courses.get(s.id) === GRAD);
  if (grad) throw badRequest(`${fullName(grad)} está en GRAD TEAM: ya no se le pueden cargar marcas nuevas.`);
  return courses;
}

type SaveBody = { batchId: string; disciplineId: string; takenOn: string; entries: { studentId: string; value: number | null }[]; attempts?: JumpAttempt[] };

export async function saveMarks(user: SessionUser, body: SaveBody): Promise<SaveResult> {
  const d = await getDiscipline(body.disciplineId);
  if (!d.active) throw badRequest("Esta disciplina está desactivada.");
  if (body.takenOn > todayAR()) throw badRequest("La fecha no puede ser futura.", { takenOn: "La fecha no puede ser futura." });
  if (body.attempts?.length) return saveJumps(user, d, { ...body, attempts: body.attempts });
  const ids = body.entries.map((e) => e.studentId);
  if (new Set(ids).size !== ids.length) throw badRequest("Hay un alumno repetido en el envío.");
  for (const e of body.entries) {
    const err = e.value == null ? null : rangeError(e.value, d);
    if (err) throw badRequest(err);
  }
  return db.transaction(async (tx) => {
    const found = await tx.select().from(students).where(and(inArray(students.id, ids), eq(students.active, true)));
    if (found.length !== ids.length) throw badRequest("Hay alumnos que ya no están en la lista. Recargá la página.");
    const courses = await coursesForMarks(tx, found, body.takenOn);
    await tx
      .insert(marks)
      .values(body.entries.map((e) => ({ studentId: e.studentId, disciplineId: d.id, value: e.value, takenOn: body.takenOn, courseAt: courses.get(e.studentId)!, batchId: body.batchId, createdBy: user.id })))
      .onConflictDoNothing();
    for (const id of ids) await recomputePb(tx, id, d);
    return batchResult(tx, body.batchId);
  });
}

/**
 * Una clase de salto en alto por alturas. Llega entera cada vez que el profe cambia de altura o termina, así que se
 * guardan los intentos nuevos (los repetidos se ignoran) y la marca de cada alumno se recalcula desde todo lo guardado:
 * aunque un envío viejo llegue tarde, la marca nunca baja.
 */
async function saveJumps(user: SessionUser, d: Discipline, body: SaveBody & { attempts: JumpAttempt[] }): Promise<SaveResult> {
  if (!d.heights) throw badRequest("Esta disciplina no se toma por alturas.");
  const err = attemptsError(body.attempts);
  if (err) throw badRequest(err);
  for (const h of new Set(body.attempts.map((a) => a.height))) {
    const out = rangeError(h, d);
    if (out) throw badRequest(out);
  }
  const ids = [...new Set(body.attempts.map((a) => a.studentId))];
  return db.transaction(async (tx) => {
    const found = await tx.select().from(students).where(and(inArray(students.id, ids), eq(students.active, true)));
    if (found.length !== ids.length) throw badRequest("Hay alumnos que ya no están en la lista. Recargá la página.");
    const courses = await coursesForMarks(tx, found, body.takenOn);
    await tx
      .insert(jumpAttempts)
      .values(body.attempts.map((a) => ({ ...a, batchId: body.batchId, disciplineId: d.id, takenOn: body.takenOn, createdBy: user.id })))
      .onConflictDoNothing();
    const all = await tx
      .select({ studentId: jumpAttempts.studentId, round: jumpAttempts.round, height: jumpAttempts.height, seq: jumpAttempts.seq, result: jumpAttempts.result })
      .from(jumpAttempts)
      .where(eq(jumpAttempts.batchId, body.batchId));
    const entries = marksFrom(all).filter((e) => courses.has(e.studentId));
    if (entries.length) {
      await tx
        .insert(marks)
        .values(entries.map((e) => ({ studentId: e.studentId, disciplineId: d.id, value: e.value, takenOn: body.takenOn, courseAt: courses.get(e.studentId)!, batchId: body.batchId, createdBy: user.id })))
        .onConflictDoUpdate({ target: [marks.batchId, marks.studentId], set: { value: sql`excluded.value` } });
    }
    for (const e of entries) await recomputePb(tx, e.studentId, d);
    return batchResult(tx, body.batchId);
  });
}

/** Las clases de salto por alturas de un alumno, de la más nueva a la más vieja. */
export async function jumpsOfStudent(studentId: string): Promise<(JumpHistory & { disciplineId: string })[]> {
  const rows = await db
    .select({ batchId: jumpAttempts.batchId, disciplineId: jumpAttempts.disciplineId, takenOn: jumpAttempts.takenOn, round: jumpAttempts.round, height: jumpAttempts.height, seq: jumpAttempts.seq, result: jumpAttempts.result })
    .from(jumpAttempts)
    .where(eq(jumpAttempts.studentId, studentId))
    .orderBy(desc(jumpAttempts.takenOn), desc(jumpAttempts.createdAt));
  const out = new Map<string, JumpHistory & { disciplineId: string }>();
  for (const r of rows) {
    const cur = out.get(r.batchId) ?? { batchId: r.batchId, disciplineId: r.disciplineId, takenOn: r.takenOn, attempts: [] };
    cur.attempts.push({ round: r.round, height: r.height, seq: r.seq, result: r.result });
    out.set(r.batchId, cur);
  }
  for (const j of out.values()) j.attempts.sort((a, b) => a.round - b.round || a.seq - b.seq);
  return [...out.values()];
}

/** Borra marcas y recalcula las marcas personales de cada alumno. Las que ya no existen (las borró otro) se saltean. */
export async function deleteMarks(ids: string[]) {
  return db.transaction(async (tx) => {
    // Si eran de una clase por alturas, se van también sus intentos: si no, un reenvío las volvería a crear.
    await tx.delete(jumpAttempts).where(
      exists(
        tx
          .select({ id: marks.id })
          .from(marks)
          .where(and(inArray(marks.id, ids), eq(marks.batchId, jumpAttempts.batchId), eq(marks.studentId, jumpAttempts.studentId))),
      ),
    );
    const deleted = await tx.delete(marks).where(inArray(marks.id, ids)).returning();
    if (deleted.length === 0) return deleted;
    const used = await tx.select().from(disciplines).where(inArray(disciplines.id, [...new Set(deleted.map((m) => m.disciplineId))]));
    const byId = new Map(used.map((d) => [d.id, toDiscipline(d)]));
    const pairs = new Map(deleted.map((m) => [`${m.studentId}:${m.disciplineId}`, m]));
    for (const m of pairs.values()) await recomputePb(tx, m.studentId, byId.get(m.disciplineId)!);
    return deleted;
  });
}

export async function deleteMark(id: string) {
  const [mark] = await deleteMarks([id]);
  if (!mark) throw notFound("La marca");
  return mark;
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
  createdByName: author.username,
};

type RawMark = Omit<MarkRow, "canDelete">;
function present<T extends RawMark>(m: T, user: SessionUser): T & { canDelete: boolean } {
  return { ...m, canDelete: isAdmin(user.role) };
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

type MarkFilter = { disciplineId?: string; course?: string; house?: string; gender?: string };

function filterCond(filter: MarkFilter): SQL | undefined {
  const where: SQL[] = [];
  if (filter.disciplineId) where.push(eq(marks.disciplineId, filter.disciplineId));
  if (filter.course) where.push(eq(marks.courseAt, filter.course));
  if (filter.house) where.push(eq(students.house, filter.house));
  if (filter.gender) where.push(eq(students.gender, filter.gender));
  return where.length ? and(...where) : undefined;
}

/** Los ids de todos los registros que coinciden, para elegirlos de una vez. Mismo orden que la lista. */
export async function markIds(filter: MarkFilter): Promise<string[]> {
  const rows = await db
    .select({ id: marks.id })
    .from(marks)
    .innerJoin(students, eq(students.id, marks.studentId))
    .where(filterCond(filter))
    .orderBy(desc(marks.createdAt), desc(marks.id))
    .limit(MAX_DELETE);
  return rows.map((r) => r.id);
}

export async function recentMarks(user: SessionUser, filter: MarkFilter & { limit: number; offset: number }): Promise<RecentPage> {
  const cond = filterCond(filter);
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
