// El paso de año: todos los alumnos activos suben un curso y los de 6.º de secundaria pasan a GRAD TEAM.
// Cada paso guarda de dónde a dónde fue cada alumno: sirve para deshacerlo y para saber qué curso tenía antes.
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import type { PromotionDone, PromotionStatus } from "@shared/contracts";
import { GRAD, PROMOTION, todayAR } from "@shared/domain/school";
import { db, type Tx } from "../db/client";
import { marks, promotions, students, users } from "../db/schema";
import { badRequest, conflict } from "../lib/errors";
import type { SessionUser } from "../types";

/** Entre un paso y otro pasan meses: así un doble clic o un segundo admin no suben dos cursos de golpe. */
const MIN_DAYS = 180;
/** Después ya hay marcas y alumnos nuevos del año siguiente, y deshacer mezclaría todo. */
const UNDO_DAYS = 30;

const daysSince = (date: Date) => (Date.now() - date.getTime()) / 86_400_000;
/** Un paso de año a la vez. */
const lock = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('record:promotion'))`);

async function lastPromotion(tx: Tx | typeof db) {
  const [row] = await tx.select().from(promotions).where(isNull(promotions.undoneAt)).orderBy(desc(promotions.createdAt)).limit(1);
  return row ?? null;
}

const studentsIn = (from: string) => and(eq(students.active, true), eq(students.course, from));

export async function promotionStatus(): Promise<PromotionStatus> {
  const counts = await db.select({ course: students.course, n: count() }).from(students).where(eq(students.active, true)).groupBy(students.course);
  const n = (course: string) => counts.find((r) => r.course === course)?.n ?? 0;
  const last = await lastPromotion(db);
  const [author] = last ? await db.select({ name: users.username }).from(users).where(eq(users.id, last.createdBy)) : [];
  return {
    steps: PROMOTION.map(({ from, to }) => ({ from, to, students: n(from) })),
    graduates: n(GRAD),
    ready: !last || daysSince(last.createdAt) >= MIN_DAYS,
    last: last && {
      id: last.id,
      on: last.effectiveOn,
      byName: author?.name ?? "",
      moved: last.moved.length,
      graduated: last.moved.filter((m) => m.to === GRAD).length,
      canUndo: daysSince(last.createdAt) < UNDO_DAYS,
    },
  };
}

export async function promoteAll(user: SessionUser): Promise<PromotionDone & { id: string }> {
  return db.transaction(async (tx) => {
    await lock(tx);
    const last = await lastPromotion(tx);
    if (last && daysSince(last.createdAt) < MIN_DAYS) throw conflict("El paso de año ya se hizo hace poco. Si fue un error, deshacelo.");
    const moved: { id: string; from: string; to: string }[] = [];
    // De arriba hacia abajo: cada curso ya está vacío cuando llegan los del anterior.
    for (const { from, to } of [...PROMOTION].reverse()) {
      const rows = await tx.update(students).set({ course: to, updatedAt: new Date() }).where(studentsIn(from)).returning({ id: students.id });
      moved.push(...rows.map((r) => ({ id: r.id, from, to })));
    }
    if (moved.length === 0) throw badRequest("No hay alumnos para pasar de año.");
    const [row] = await tx.insert(promotions).values({ effectiveOn: todayAR(), moved, createdBy: user.id }).returning({ id: promotions.id });
    return { id: row!.id, moved: moved.length, graduated: moved.filter((m) => m.to === GRAD).length };
  });
}

export async function undoPromotion(id: string): Promise<{ restored: number; skipped: number }> {
  try {
    return await db.transaction(async (tx) => {
      await lock(tx);
      const last = await lastPromotion(tx);
      if (!last || last.id !== id) throw conflict("Ese paso de año ya no se puede deshacer. Recargá la página.");
      if (daysSince(last.createdAt) >= UNDO_DAYS) throw conflict(`El paso de año solo se puede deshacer durante ${UNDO_DAYS} días.`);
      let restored = 0;
      // De abajo hacia arriba, por lo mismo. A quien le cambiaron el curso a mano después no se lo toca.
      for (const { from, to } of PROMOTION) {
        const ids = last.moved.filter((m) => m.from === from).map((m) => m.id);
        if (ids.length === 0) continue;
        const rows = await tx
          .update(students)
          .set({ course: from, updatedAt: new Date() })
          .where(and(inArray(students.id, ids), eq(students.course, to)))
          .returning({ id: students.id });
        restored += rows.length;
        // Las marcas tomadas mientras tanto quedaron con el curso de más.
        if (rows.length) {
          await tx
            .update(marks)
            .set({ courseAt: from })
            .where(and(inArray(marks.studentId, rows.map((r) => r.id)), eq(marks.courseAt, to), gte(marks.createdAt, last.createdAt), gte(marks.takenOn, last.effectiveOn)));
        }
      }
      await tx.update(promotions).set({ undoneAt: new Date() }).where(eq(promotions.id, id));
      return { restored, skipped: last.moved.length - restored };
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw conflict("No se puede deshacer: hay un alumno nuevo con el mismo nombre y curso que otro que tendría que volver. Cambialo en la lista y probá de nuevo.");
    throw err;
  }
}

/**
 * El curso que tenía cada alumno ese día. Una marca cargada con fecha anterior al paso de año (o que un teléfono envía
 * tarde) queda con el curso de entonces, y si era de 6.º de secundaria se acepta aunque ya esté en GRAD TEAM.
 */
export async function coursesOn(tx: Tx, list: { id: string; course: string }[], date: string): Promise<Map<string, string>> {
  const out = new Map(list.map((s) => [s.id, s.course]));
  const later = await tx
    .select({ moved: promotions.moved })
    .from(promotions)
    .where(and(isNull(promotions.undoneAt), gt(promotions.effectiveOn, date)))
    .orderBy(asc(promotions.createdAt));
  const seen = new Set<string>();
  for (const p of later) {
    for (const m of p.moved) {
      if (seen.has(m.id) || !out.has(m.id)) continue;
      seen.add(m.id);
      out.set(m.id, m.from);
    }
  }
  return out;
}
