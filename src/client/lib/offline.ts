// Uso sin señal. El servidor sigue siendo la única fuente compartida: acá solo se guarda en el teléfono
// (1) lo necesario para abrir la app y cargar (listas, disciplinas) y (2) las cargas que no se pudieron
// enviar, que salen solas cuando vuelve la conexión. Como cada envío tiene su batchId, reintentar no duplica.
import { useEffect, useState } from "react";
import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import type { RosterStudent, SaveResult, Student } from "@shared/contracts";
import type { Group } from "@shared/domain/school";
import { ApiError, api } from "./api";

// ---------- Lo que se guarda del caché ----------
const CACHE_KEY = "record:cache";
const KEEP = [/^\/api\/auth\/me$/, /^\/api\/disciplines$/, /^\/api\/students$/, /^\/api\/roster\?/, /^\/api\/students\/[^/]+\/context\?/, /^\/api\/marks\?/];
const keep = (key: unknown) => typeof key === "string" && KEEP.some((re) => re.test(key));

export function restoreCache(qc: QueryClient) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) hydrate(qc, JSON.parse(raw));
  } catch {
    // Un caché roto no impide arrancar: se vuelve a pedir todo.
  }
}

export function persistCache(qc: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  qc.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === "success" && keep(q.queryKey[0]) });
        localStorage.setItem(CACHE_KEY, JSON.stringify(state));
      } catch {
        // Sin espacio o sin almacenamiento: la app sigue andando con conexión.
      }
    }, 800);
  });
}

/** Al salir no quedan datos de alumnos en el teléfono. */
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nada que hacer.
  }
}

/** Sin conexión con el servidor (no un error de datos): vale la pena reintentar más tarde. */
export const isOfflineError = (err: unknown) => err instanceof ApiError && (err.isNetwork || [502, 503, 504].includes(err.status));

/** Sin señal y sin la lista del grupo guardada: se arma con la lista completa de alumnos, sin mejores marcas. */
export function rosterFromStudents(all: Student[], group: Group, gender: string): RosterStudent[] {
  return all
    .filter((s) => s.active && (!group.course || s.course === group.course) && (!group.house || s.house === group.house) && (!gender || s.gender === gender))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "es") || a.firstName.localeCompare(b.firstName, "es"))
    .map((s) => ({ ...s, best: null }));
}

// ---------- Cargas pendientes de envío ----------
export type MarksBody = { batchId: string; disciplineId: string; takenOn: string; entries: { studentId: string; value: number | null }[] };
export type Pending = { body: MarksBody; label: string; queuedAt: string; error?: string };

const OUTBOX = (userId: string) => `record:outbox:${userId}`;
const EVENT = "record:outbox";

export function readOutbox(userId: string): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX(userId)) ?? "[]") as Pending[];
  } catch {
    return [];
  }
}
function writeOutbox(userId: string, list: Pending[]) {
  try {
    if (list.length) localStorage.setItem(OUTBOX(userId), JSON.stringify(list));
    else localStorage.removeItem(OUTBOX(userId));
  } catch {
    // Sin almacenamiento: la carga queda en memoria hasta cerrar la página.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Envía las marcas; si no hay conexión, las deja en el teléfono para mandarlas después. */
export async function sendMarks(userId: string, body: MarksBody, label: string): Promise<{ result: SaveResult; queued: boolean }> {
  try {
    return { result: await api.post<SaveResult>("/api/marks", body), queued: false };
  } catch (err) {
    if (!isOfflineError(err)) throw err;
    const list = readOutbox(userId).filter((p) => p.body.batchId !== body.batchId);
    writeOutbox(userId, [...list, { body, label, queuedAt: new Date().toISOString() }]);
    const saved = body.entries.filter((e) => e.value != null).length;
    return { result: { saved, absent: body.entries.length - saved, personalBests: [] }, queued: true };
  }
}

let flushing = false;
/** Manda lo pendiente en orden. Corta si sigue sin conexión; si el servidor rechaza una carga, la marca con el motivo. */
export async function flushOutbox(userId: string, retryRejected = false): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const p of readOutbox(userId)) {
      if (p.error && !retryRejected) continue;
      try {
        await api.post("/api/marks", p.body);
        writeOutbox(userId, readOutbox(userId).filter((x) => x.body.batchId !== p.body.batchId));
        sent++;
      } catch (err) {
        if (isOfflineError(err) || (err instanceof ApiError && err.status === 401)) break;
        writeOutbox(userId, readOutbox(userId).map((x) => (x.body.batchId === p.body.batchId ? { ...x, error: (err as Error).message } : x)));
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function discardPending(userId: string, batchId: string) {
  writeOutbox(userId, readOutbox(userId).filter((p) => p.body.batchId !== batchId));
}

export function useOutbox(userId: string): Pending[] {
  const [list, setList] = useState(() => readOutbox(userId));
  useEffect(() => {
    const refresh = () => setList(readOutbox(userId));
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);
  return list;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
