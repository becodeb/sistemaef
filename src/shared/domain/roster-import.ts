// Lee la lista de alumnos pegada desde Excel o un CSV: Apellido, Nombre, Curso, House y Sexo.
import { COURSES, type Gender, type House } from "./school";
import { fold } from "./names";

export type RosterRow = { line: number; lastName: string; firstName: string; course: string; house: House; gender: Gender | null };
export type RosterError = { line: number; message: string };

const HOUSE_ALIASES: Record<string, House> = { earth: "earth", tierra: "earth", wind: "wind", viento: "wind", water: "water", agua: "water" };
const LEVEL_ALIASES: Record<string, string> = { es: "ES", sec: "ES", secundaria: "ES", ep: "EP", pri: "EP", prim: "EP", primaria: "EP" };
const GENDER_ALIASES: Record<string, Gender> = { m: "m", f: "m", mujer: "m", mujeres: "m", femenino: "m", h: "h", v: "h", hombre: "h", hombres: "h", varon: "h", masculino: "h" };

/** Acepta 6ES, 6 ES, 6to ES, 6° EP o 6.º Secundaria. */
export function parseCourse(raw: string): string | null {
  const m = fold(raw).trim().match(/^([1-6])\s*(?:ro|do|to|er|°|º|\.º|\.°)?\s*(?:ano\s*(?:de\s*)?)?(es|sec|secundaria|ep|pri|prim|primaria)$/);
  if (!m) return null;
  const course = `${m[1]}${LEVEL_ALIASES[m[2]!]}`;
  return COURSES.includes(course) ? course : null;
}
export function parseHouse(raw: string): House | null {
  return HOUSE_ALIASES[fold(raw).trim().replace(/^house\s+/, "")] ?? null;
}
export function parseGender(raw: string): Gender | null {
  return GENDER_ALIASES[fold(raw).trim()] ?? null;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

type Field = "last" | "first" | "course" | "house" | "gender";
const HEADERS: [RegExp, Field][] = [
  [/^apellidos?$/, "last"],
  [/^nombres?$/, "first"],
  [/^curso$/, "course"],
  [/^(house|equipo|casa)$/, "house"],
  [/^(sexo|genero)$/, "gender"],
];

export function parseRoster(text: string): { rows: RosterRow[]; errors: RosterError[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((raw, i) => ({ raw, line: i + 1 })).filter((l) => l.raw.trim() !== "");
  const first = lines[0]?.raw ?? "";
  const sep = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  let order: (Field | null)[] = ["last", "first", "course", "house", "gender"];
  const mapped = splitLine(first, sep).map((c) => HEADERS.find(([re]) => re.test(fold(c).trim()))?.[1] ?? null);
  const hasHeader = mapped.filter(Boolean).length >= 2;
  if (hasHeader) order = mapped;

  const rows: RosterRow[] = [];
  const errors: RosterError[] = [];
  for (const { raw, line } of hasHeader ? lines.slice(1) : lines) {
    const cells = splitLine(raw, sep);
    const get = (f: Field) => {
      const i = order.indexOf(f);
      return i >= 0 ? (cells[i] ?? "") : "";
    };
    const lastName = get("last");
    const firstName = get("first");
    const course = parseCourse(get("course"));
    const house = parseHouse(get("house"));
    const genderRaw = get("gender");
    const gender = parseGender(genderRaw);
    const problems = [
      !lastName && "falta el apellido",
      !firstName && "falta el nombre",
      !course && `el curso «${get("course")}» no es válido (por ejemplo: 6ES o 3EP)`,
      !house && `el house «${get("house")}» no es Earth, Wind ni Water`,
      genderRaw && !gender && `el sexo «${genderRaw}» no es Mujer ni Hombre`,
    ].filter(Boolean);
    if (problems.length) errors.push({ line, message: problems.join(", ") });
    else rows.push({ line, lastName, firstName, course: course!, house: house!, gender });
  }
  return { rows, errors };
}
