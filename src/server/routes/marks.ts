import { Hono, type Context } from "hono";
import { deleteMarksBody, saveMarksBody } from "@shared/contracts";
import { currentUser, requireAdmin } from "../auth";
import { readJson } from "../lib/errors";
import { log } from "../lib/logger";
import { audit } from "../services/audit";
import { deleteMark, deleteMarks, markIds, recentMarks, saveMarks } from "../services/marks";
import type { AppEnv } from "../types";

function filterOf(c: Context) {
  const { disciplineId, course, house, gender } = c.req.query();
  return { disciplineId: disciplineId || undefined, course: course || undefined, house: house || undefined, gender: gender || undefined };
}

export const markRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const { limit, offset } = c.req.query();
    return c.json(
      await recentMarks(currentUser(c), {
        ...filterOf(c),
        limit: Math.min(Number(limit) || 10, 100),
        offset: Math.max(Number(offset) || 0, 0),
      }),
    );
  })
  .get("/ids", requireAdmin, async (c) => c.json({ ids: await markIds(filterOf(c)) }))
  .post("/delete", requireAdmin, async (c) => {
    const { ids } = await readJson(c, deleteMarksBody);
    const user = currentUser(c);
    const deleted = await deleteMarks(ids);
    if (deleted.length) {
      await audit(user.id, "marks_deleted", undefined, {
        count: deleted.length,
        marks: deleted.map((m) => ({ id: m.id, studentId: m.studentId, disciplineId: m.disciplineId, value: m.value, takenOn: m.takenOn })),
      });
    }
    log.info("marks_deleted", { count: deleted.length });
    return c.json({ deleted: deleted.length });
  })
  .post("/", async (c) => {
    const body = await readJson(c, saveMarksBody);
    const result = await saveMarks(currentUser(c), body);
    log.info("marks_saved", { saved: result.saved, absent: result.absent });
    return c.json(result, 201);
  })
  .delete("/:id", requireAdmin, async (c) => {
    const user = currentUser(c);
    const mark = await deleteMark(c.req.param("id"));
    await audit(user.id, "mark_deleted", mark.id, { studentId: mark.studentId, disciplineId: mark.disciplineId, value: mark.value, takenOn: mark.takenOn });
    return c.json({ ok: true });
  });
