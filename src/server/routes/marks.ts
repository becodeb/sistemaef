import { Hono } from "hono";
import { saveMarksBody } from "@shared/contracts";
import { currentUser } from "../auth";
import { readJson } from "../lib/errors";
import { log } from "../lib/logger";
import { audit } from "../services/audit";
import { deleteMark, recentMarks, saveMarks } from "../services/marks";
import type { AppEnv } from "../types";

export const markRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const { disciplineId, course, house, gender, limit, offset } = c.req.query();
    return c.json(
      await recentMarks(currentUser(c), {
        disciplineId: disciplineId || undefined,
        course: course || undefined,
        house: house || undefined,
        gender: gender || undefined,
        limit: Math.min(Number(limit) || 10, 100),
        offset: Math.max(Number(offset) || 0, 0),
      }),
    );
  })
  .post("/", async (c) => {
    const body = await readJson(c, saveMarksBody);
    const result = await saveMarks(currentUser(c), body);
    log.info("marks_saved", { saved: result.saved, absent: result.absent });
    return c.json(result, 201);
  })
  .delete("/:id", async (c) => {
    const user = currentUser(c);
    const mark = await deleteMark(user, c.req.param("id"));
    await audit(user.id, "mark_deleted", mark.id, { studentId: mark.studentId, disciplineId: mark.disciplineId, value: mark.value, takenOn: mark.takenOn });
    return c.json({ ok: true });
  });
