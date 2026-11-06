import { db } from "../db/client";
import { auditLogs } from "../db/schema";

/** Queda quién hizo qué. Solo ids y conteos, sin datos de alumnos. */
export async function audit(userId: string, action: string, entityId?: string, meta?: Record<string, unknown>) {
  await db.insert(auditLogs).values({ userId, action, entityId, meta });
}
