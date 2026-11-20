// Salto en alto por rondas de alturas. El profe fija una altura, pasa a cada alumno (Saltó, Nulo o Ausente) y,
// cuando no queda nadie, sube la varilla: a la altura nueva pasan solo los que superaron la anterior.
// Todo sale de la lista de intentos, así «deshacer» es sacar el último y el servidor valida lo mismo que la pantalla.

/** cleared: saltó. retry: nulo y vuelve a intentar. out: nulo y no vuelve a intentar. absent: no está. */
export type JumpResult = "cleared" | "retry" | "out" | "absent";
export const JUMP_RESULTS = ["cleared", "retry", "out", "absent"] as const;

export type JumpAttempt = { studentId: string; round: number; height: number; seq: number; result: JumpResult };
/** `order`: los que empiezan esa altura, en el orden de la lista. */
export type JumpRound = { height: number; order: string[] };
export type JumpSession = { rounds: JumpRound[]; attempts: JumpAttempt[] };

export const startSession = (height: number, ids: string[]): JumpSession => ({ rounds: [{ height, order: [...ids] }], attempts: [] });

export const currentRound = (s: JumpSession) => s.rounds.length;
export const currentHeight = (s: JumpSession) => s.rounds[s.rounds.length - 1]!.height;
const attemptsIn = (s: JumpSession, round: number) => s.attempts.filter((a) => a.round === round);

/** Cómo terminó (o va) cada alumno en una ronda: su último intento. Sin intentos: todavía no saltó. */
export function lastResults(s: JumpSession, round = currentRound(s)): Map<string, JumpAttempt> {
  const out = new Map<string, JumpAttempt>();
  for (const a of attemptsIn(s, round)) out.set(a.studentId, a);
  return out;
}

/** Los que faltan en la altura actual, en orden: un nulo con otro intento pasa al final. */
export function queueOf(s: JumpSession): string[] {
  let q = [...s.rounds[s.rounds.length - 1]!.order];
  for (const a of attemptsIn(s, currentRound(s))) {
    q = q.filter((id) => id !== a.studentId);
    if (a.result === "retry") q.push(a.studentId);
  }
  return q;
}

export const roundDone = (s: JumpSession) => queueOf(s).length === 0;

/** Intento que le toca al alumno en la altura actual (1 si todavía no saltó). */
export const nextSeq = (s: JumpSession, studentId: string) => attemptsIn(s, currentRound(s)).filter((a) => a.studentId === studentId).length + 1;

export function record(s: JumpSession, studentId: string, result: JumpResult): JumpSession {
  if (!queueOf(s).includes(studentId)) return s;
  const attempt: JumpAttempt = { studentId, round: currentRound(s), height: currentHeight(s), seq: nextSeq(s, studentId), result };
  return { ...s, attempts: [...s.attempts, attempt] };
}

/** Deshace lo último anotado en la altura actual (lo de alturas anteriores ya se guardó). */
export function undo(s: JumpSession): JumpSession {
  const last = s.attempts[s.attempts.length - 1];
  if (!last || last.round !== currentRound(s)) return s;
  return { ...s, attempts: s.attempts.slice(0, -1) };
}

/** Pasan a la altura siguiente solo los que la saltaron, en el orden de la lista. */
export function advancing(s: JumpSession): string[] {
  const last = lastResults(s);
  return s.rounds[s.rounds.length - 1]!.order.filter((id) => last.get(id)?.result === "cleared");
}

export function nextHeightError(s: JumpSession, height: number): string | null {
  return height > currentHeight(s) + 1e-9 ? null : "La altura nueva tiene que ser más alta que la anterior.";
}

export function nextRound(s: JumpSession, height: number): JumpSession {
  return { ...s, rounds: [...s.rounds, { height, order: advancing(s) }] };
}

/**
 * La marca de cada alumno en la clase: la altura más alta que superó. Si faltó sin haber saltado nada, queda ausente
 * (null). Si no superó la altura inicial, no tiene marca: el detalle queda en los intentos.
 */
export function marksFrom(attempts: JumpAttempt[]): { studentId: string; value: number | null }[] {
  const by = new Map<string, { best: number | null; absent: boolean }>();
  for (const a of attempts) {
    const cur = by.get(a.studentId) ?? { best: null, absent: false };
    if (a.result === "cleared" && (cur.best == null || a.height > cur.best)) cur.best = a.height;
    if (a.result === "absent") cur.absent = true;
    by.set(a.studentId, cur);
  }
  return [...by].flatMap(([studentId, r]): { studentId: string; value: number | null }[] => (r.best != null ? [{ studentId, value: r.best }] : r.absent ? [{ studentId, value: null }] : []));
}

/**
 * Revisa que los intentos de una clase tengan sentido: una altura por ronda y cada vez más alta, intentos seguidos
 * (todos nulos con otro intento menos el último) y que nadie salte una altura sin haber superado la anterior.
 */
export function attemptsError(attempts: JumpAttempt[]): string | null {
  const heights = new Map<number, number>();
  const groups = new Map<string, JumpAttempt[]>();
  for (const a of attempts) {
    if (!Number.isInteger(a.round) || a.round < 1 || !Number.isInteger(a.seq) || a.seq < 1) return "Hay un intento mal numerado.";
    const h = heights.get(a.round);
    if (h != null && h !== a.height) return "Una misma ronda tiene dos alturas distintas.";
    heights.set(a.round, a.height);
    const key = `${a.studentId}:${a.round}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const rounds = [...heights.keys()].sort((a, b) => a - b);
  for (let i = 0; i < rounds.length; i++) {
    if (rounds[i] !== i + 1) return "Falta una de las alturas de la clase.";
    if (i > 0 && heights.get(rounds[i]!)! <= heights.get(rounds[i - 1]!)!) return "Cada altura nueva tiene que ser más alta que la anterior.";
  }
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.seq - b.seq);
    if (sorted.some((a, i) => a.seq !== i + 1)) return "Hay intentos repetidos o salteados.";
    if (sorted.slice(0, -1).some((a) => a.result !== "retry")) return "Hay intentos anotados después de que el alumno terminó esa altura.";
    const [studentId, round] = [key.slice(0, key.lastIndexOf(":")), Number(key.slice(key.lastIndexOf(":") + 1))];
    if (round > 1) {
      const prev = groups.get(`${studentId}:${round - 1}`);
      if (prev?.reduce((a, b) => (b.seq > a.seq ? b : a)).result !== "cleared") return "Un alumno intentó una altura sin haber superado la anterior.";
    }
  }
  return null;
}

/** Resumen de una altura para el historial: los intentos en orden y cómo terminó. */
export type HeightLine = { round: number; height: number; tries: JumpResult[]; result: JumpResult };
export function heightLines(attempts: JumpAttempt[]): HeightLine[] {
  const by = new Map<number, JumpAttempt[]>();
  for (const a of attempts) by.set(a.round, [...(by.get(a.round) ?? []), a]);
  return [...by]
    .sort(([a], [b]) => a - b)
    .map(([round, list]) => {
      const tries = [...list].sort((a, b) => a.seq - b.seq);
      return { round, height: tries[0]!.height, tries: tries.map((a) => a.result), result: tries[tries.length - 1]!.result };
    });
}
