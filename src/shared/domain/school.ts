// La estructura del colegio: primaria y secundaria de 1.º a 6.º, y los houses, que son los equipos.
export const LEVELS = [
  { key: "EP", name: "Primaria" },
  { key: "ES", name: "Secundaria" },
] as const;
export const COURSES = LEVELS.flatMap((l) => [1, 2, 3, 4, 5, 6].map((y) => `${y}${l.key}`));
export const HOUSES = ["earth", "wind", "water"] as const;
export const GENDERS = ["m", "h"] as const;

export type House = (typeof HOUSES)[number];
export type Gender = (typeof GENDERS)[number];

export const HOUSE_NAMES: Record<string, string> = { earth: "Earth", wind: "Wind", water: "Water" };
export const GENDER_NAMES: Record<string, string> = { m: "Mujeres", h: "Hombres" };
export const GENDER_ONE: Record<string, string> = { m: "Mujer", h: "Hombre" };

/** 6ES pasa a «6.º ES». */
export const courseLabel = (course: string) => `${course[0]}.º ${course.slice(1)}`;
/** 6ES pasa a «6.º año de secundaria». */
export function courseName(course: string): string {
  const level = LEVELS.find((l) => l.key === course.slice(1));
  return `${course[0]}.º año de ${(level?.name ?? "").toLowerCase()}`;
}

/** Un grupo para cargar marcas: un curso (c:6ES), un house (h:earth) o los dos juntos (c:6ES+h:earth). */
export type Group = { key: string; type: "course" | "house"; name: string; short: string; course?: string; house?: House };

export function groupKeyOf(course?: string | null, house?: string | null): string | null {
  const parts = [course && `c:${course}`, house && `h:${house}`].filter(Boolean);
  return parts.length ? parts.join("+") : null;
}

export function groupByKey(key: string | null | undefined): Group | undefined {
  if (!key) return undefined;
  let course: string | undefined;
  let house: House | undefined;
  for (const part of key.split("+")) {
    const value = part.slice(2);
    if (part.startsWith("c:") && !course && COURSES.includes(value)) course = value;
    else if (part.startsWith("h:") && !house && (HOUSES as readonly string[]).includes(value)) house = value as House;
    else return undefined;
  }
  return {
    key: groupKeyOf(course, house)!,
    type: course ? "course" : "house",
    name: [course && courseName(course), house && `House ${HOUSE_NAMES[house]}`].filter(Boolean).join(" · "),
    short: [course && courseLabel(course), house && HOUSE_NAMES[house]].filter(Boolean).join(" · "),
    course,
    house,
  };
}

export const GROUPS: Group[] = [...COURSES.map((c) => groupByKey(`c:${c}`)!), ...HOUSES.map((h) => groupByKey(`h:${h}`)!)];

/** Fecha de hoy en Argentina como YYYY-MM-DD; el servidor corre en UTC y de noche sería mañana. */
export function todayAR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
