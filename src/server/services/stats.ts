// Cálculos de Inicio, Rankings y Progreso. Funciones puras sobre las marcas ya cargadas.
import type { Discipline, EvolutionPoint, HouseRow, ProgressRow, RankingRow, Student } from "@shared/contracts";
import { isBetter } from "@shared/domain/marks";
import type { LoadedMark } from "./marks";

function byStudent(all: LoadedMark[]) {
  const map = new Map<string, { student: Student; marks: LoadedMark[] }>();
  for (const m of all) {
    const entry = map.get(m.student.id) ?? { student: m.student, marks: [] };
    entry.marks.push(m);
    map.set(m.student.id, entry);
  }
  return [...map.values()];
}

function bestOf(d: Discipline, list: LoadedMark[]) {
  let index = 0;
  list.forEach((m, i) => {
    if (isBetter(d, m.value, list[index]!.value)) index = i;
  });
  return { best: list[index]!, index };
}

/** Promedio por mes de las marcas recibidas. */
export function monthlyEvolution(all: LoadedMark[]): EvolutionPoint[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const m of all) {
    const month = m.takenOn.slice(0, 7);
    const e = map.get(month) ?? { sum: 0, count: 0 };
    e.sum += m.value;
    e.count++;
    map.set(month, e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, e]) => ({ month, average: e.sum / e.count, count: e.count }));
}

const RECENT_MS = 30 * 24 * 60 * 60_000;

/** Ranking por la mejor marca de cada alumno; quienes empatan comparten el puesto. */
export function ranking(d: Discipline, all: LoadedMark[], now = Date.now()): RankingRow[] {
  const rows = byStudent(all)
    .map(({ student, marks }) => {
      const { best, index } = bestOf(d, marks);
      const previous = index > 0 ? marks[index - 1]! : null;
      return { student, best, vsPrevious: previous ? best.value - previous.value : null };
    })
    .sort((a, b) => (d.better === "hi" ? b.best.value - a.best.value : a.best.value - b.best.value) || a.student.lastName.localeCompare(b.student.lastName, "es"));
  const leader = rows[0]?.best.value;
  let position = 0;
  let lastValue: number | null = null;
  return rows.map((r, i) => {
    if (r.best.value !== lastValue) {
      position = i + 1;
      lastValue = r.best.value;
    }
    return {
      position,
      student: r.student,
      value: r.best.value,
      takenOn: r.best.takenOn,
      courseAt: r.best.courseAt,
      diffFirst: position === 1 ? null : r.best.value - leader!,
      vsPrevious: r.vsPrevious,
      isRecentPb: r.best.isPb && now - new Date(r.best.takenOn).getTime() < RECENT_MS,
    };
  });
}

/** Cómo va cada house: promedio de las mejores marcas de sus alumnos y la mejor de todas. */
export function houseStandings(d: Discipline, all: LoadedMark[]): HouseRow[] {
  const map = new Map<string, number[]>();
  for (const { student, marks } of byStudent(all)) {
    const list = map.get(student.house) ?? [];
    list.push(bestOf(d, marks).best.value);
    map.set(student.house, list);
  }
  return [...map.entries()]
    .map(([house, values]) => ({
      house,
      students: values.length,
      average: values.reduce((a, b) => a + b, 0) / values.length,
      best: d.better === "hi" ? Math.max(...values) : Math.min(...values),
    }))
    .sort((a, b) => (d.better === "hi" ? b.average - a.average : a.average - b.average));
}

/** Cuánto mejoró cada alumno desde su primera marca del período; positivo siempre es mejora. */
export function progressRows(d: Discipline, all: LoadedMark[]): ProgressRow[] {
  return byStudent(all)
    .map(({ student, marks }) => {
      const first = marks[0]!.value;
      const best = bestOf(d, marks).best.value;
      return { student, first, best, marks: marks.length, progress: d.better === "hi" ? best - first : first - best };
    })
    .sort((a, b) => b.progress - a.progress || a.student.lastName.localeCompare(b.student.lastName, "es"));
}
