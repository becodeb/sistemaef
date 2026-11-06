// Lo anotado en una planilla queda en este dispositivo hasta que se guarda: si se corta la señal o se cierra
// la pestaña en la cancha, no se pierde nada. Por eso lo comparten el modo uno por uno y la planilla.
export type Draft = {
  vals: Record<string, string>;
  idx: number;
  date: string;
  /** Tras guardar a medias, la lista queda en los que faltaban. */
  onlyIds?: string[];
  /** Mismo envío si se reintenta con los mismos datos: el servidor no duplica. */
  batchId?: string;
  batchSig?: string;
};
export type DraftRef = { group: string; gender: string; disciplineId: string };

const PREFIX = "record:draft:";
const keyOf = (userId: string, r: DraftRef) => `${PREFIX}${userId}:${r.group}:${r.gender || "todos"}:${r.disciplineId}`;

export function loadDraft(userId: string, r: DraftRef): Draft | null {
  try {
    const raw = localStorage.getItem(keyOf(userId, r));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
export function saveDraft(userId: string, r: DraftRef, draft: Draft) {
  try {
    localStorage.setItem(keyOf(userId, r), JSON.stringify(draft));
  } catch {
    // Sin almacenamiento disponible se sigue trabajando en memoria.
  }
}
export function removeDraft(userId: string, r: DraftRef) {
  try {
    localStorage.removeItem(keyOf(userId, r));
  } catch {
    // Nada que hacer.
  }
}
export function listDrafts(userId: string): (DraftRef & { draft: Draft })[] {
  const out: (DraftRef & { draft: Draft })[] = [];
  try {
    const prefix = `${PREFIX}${userId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      // El grupo lleva dos puntos (c:6ES), así que se cuenta desde el final.
      const parts = key.slice(prefix.length).split(":");
      const disciplineId = parts.pop()!;
      const gender = parts.pop()!;
      out.push({ group: parts.join(":"), gender: gender === "todos" ? "" : gender, disciplineId, draft: JSON.parse(localStorage.getItem(key)!) as Draft });
    }
  } catch {
    return out;
  }
  return out;
}
