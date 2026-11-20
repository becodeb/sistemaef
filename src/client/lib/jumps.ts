// La clase de salto en alto en curso queda en este dispositivo a cada toque: si se corta la señal, se cierra la app o
// se apaga la tablet, se sigue desde el mismo alumno. Se envía entera al servidor cada vez que se cambia de altura.
import type { JumpSession } from "@shared/domain/heights";
import type { DraftRef } from "./drafts";

export type JumpDraft = { batchId: string; date: string; session: JumpSession };

const PREFIX = "record:jump:";
const keyOf = (userId: string, r: DraftRef) => `${PREFIX}${userId}:${r.group}:${r.gender || "todos"}:${r.disciplineId}`;

export function loadJump(userId: string, r: DraftRef): JumpDraft | null {
  try {
    const raw = localStorage.getItem(keyOf(userId, r));
    return raw ? (JSON.parse(raw) as JumpDraft) : null;
  } catch {
    return null;
  }
}
export function saveJump(userId: string, r: DraftRef, draft: JumpDraft) {
  try {
    localStorage.setItem(keyOf(userId, r), JSON.stringify(draft));
  } catch {
    // Sin almacenamiento se sigue en memoria.
  }
}
export function removeJump(userId: string, r: DraftRef) {
  try {
    localStorage.removeItem(keyOf(userId, r));
  } catch {
    // Nada que hacer.
  }
}
export function listJumps(userId: string): (DraftRef & { draft: JumpDraft })[] {
  const out: (DraftRef & { draft: JumpDraft })[] = [];
  try {
    const prefix = `${PREFIX}${userId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const parts = key.slice(prefix.length).split(":");
      const disciplineId = parts.pop()!;
      const gender = parts.pop()!;
      out.push({ group: parts.join(":"), gender: gender === "todos" ? "" : gender, disciplineId, draft: JSON.parse(localStorage.getItem(key)!) as JumpDraft });
    }
  } catch {
    return out;
  }
  return out;
}
