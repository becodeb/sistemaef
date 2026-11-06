// Cuerpos de los pedidos a la API (zod) y tipos de las respuestas; los usan el servidor y el cliente.
import { z } from "zod";
import { COURSES, GENDERS, HOUSES } from "./domain/school";
import { ROLES, type Role } from "./domain/roles";
import type { DisciplineDef } from "./domain/marks";

const name = z.string().trim().min(1, "Escribí este dato.").max(80);
const course = z.string().refine((c) => COURSES.includes(c), "El curso no es válido.");
const house = z.enum(HOUSES, { message: "El house es Earth, Wind o Water." });
const gender = z.enum(GENDERS, { message: "Elegí Mujer u Hombre." }).nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.");

export const loginBody = z.object({
  username: z.string().trim().min(1, "Escribí tu nombre y apellido.").max(160),
  password: z.string().min(1, "Escribí tu contraseña.").max(200),
});
export const changePasswordBody = z.object({
  current: z.string().min(1, "Escribí tu contraseña actual.").max(200),
  next: z.string().min(8, "La nueva contraseña tiene que tener al menos 8 caracteres.").max(200),
});

export const createUserBody = z.object({
  firstName: name,
  lastName: name,
  /** Vacía: el servidor genera una. */
  password: z.string().min(8, "La contraseña tiene que tener al menos 8 caracteres.").max(200).optional(),
  role: z.enum(ROLES).default("teacher"),
});
export const updateUserBody = z.object({ active: z.boolean().optional(), role: z.enum(ROLES).optional() });

export const studentBody = z.object({ firstName: name, lastName: name, course, house, gender: gender.default(null) });
export const updateStudentBody = z.object({ firstName: name, lastName: name, course, house, gender, active: z.boolean() }).partial();
export const importBody = z.object({
  dryRun: z.boolean().default(false),
  rows: z
    .array(z.object({ line: z.number().int(), firstName: name, lastName: name, course, house, gender }))
    .min(1, "No hay filas para importar.")
    .max(3000, "Son demasiadas filas: importá de a 3000."),
});

export const saveMarksBody = z.object({
  batchId: z.uuid("El envío no es válido."),
  disciplineId: z.uuid("Elegí una disciplina."),
  takenOn: isoDate,
  entries: z
    .array(z.object({ studentId: z.uuid(), value: z.number().nullable() }))
    .min(1, "No hay marcas para guardar.")
    .max(1000),
});
export const goalBody = z.object({ target: z.number().positive("La meta tiene que ser mayor que cero.").nullable() });

export const disciplineBody = z.object({
  name: name,
  what: z.string().trim().min(1, "Escribí qué se mide.").max(40),
  unit: z.enum(["m", "cm", "s", "min", "rep"]),
  better: z.enum(["hi", "lo"]),
  lo: z.number().nonnegative("El mínimo no puede ser negativo."),
  hi: z.number().positive("El máximo tiene que ser mayor que cero."),
  hint: z.string().trim().max(160).nullable().optional(),
});
export const updateDisciplineBody = z.object({
  name: name.optional(),
  what: z.string().trim().min(1).max(40).optional(),
  lo: z.number().nonnegative().optional(),
  hi: z.number().positive().optional(),
  hint: z.string().trim().max(160).nullable().optional(),
  active: z.boolean().optional(),
});

// ---------- Respuestas ----------
export type Me = { id: string; username: string; firstName: string; lastName: string; role: Role; mustChangePassword: boolean };
export type Discipline = DisciplineDef & { id: string; icon: string; sort: number; active: boolean; markCount?: number };
export type Student = { id: string; firstName: string; lastName: string; course: string; house: string; gender: string | null; active: boolean };
export type Best = { value: number; takenOn: string };
export type RosterStudent = Student & { best: Best | null };
/** `courseBest`: la mejor marca de cada curso en esta disciplina. */
export type Roster = { students: RosterStudent[]; courseBest: Record<string, number> };

export type MarkRow = {
  id: string;
  studentId: string;
  disciplineId: string;
  value: number | null;
  takenOn: string;
  isPb: boolean;
  pbDelta: number | null;
  courseAt: string;
  createdByName: string;
  canDelete: boolean;
};
export type RecentMark = MarkRow & { student: Student };
export type RecentPage = { marks: RecentMark[]; total: number };
export type SaveResult = { saved: number; absent: number; personalBests: { studentId: string; value: number; delta: number }[] };

export type StudentContext = { best: Best | null; courseBest: number | null; marks: MarkRow[]; total: number };
export type ProfileDiscipline = { disciplineId: string; marks: MarkRow[]; goal: number | null };
export type Profile = { student: Student; disciplines: ProfileDiscipline[] };

export type UserRow = { id: string; username: string; firstName: string; lastName: string; role: Role; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null };
export type UserCreated = { user: UserRow; password: string };
export type ImportRowResult = { line: number; action: "create" | "update" | "same" | "ambiguous"; name: string; detail?: string };
export type ImportResult = { dryRun: boolean; created: number; updated: number; same: number; ambiguous: number; rows: ImportRowResult[] };

export type NamedBest = { value: number; takenOn: string; student: Student; courseAt: string };
export type BestByGender = { disciplineId: string; m: NamedBest | null; h: NamedBest | null };
export type Dashboard = {
  schoolYear: number;
  schoolYears: number[];
  students: number;
  disciplines: number;
  results: number;
  personalBests: number;
  bestOfYear: BestByGender[];
  highlights: { student: Student; disciplineId: string; value: number; delta: number; takenOn: string }[];
};
export type EvolutionPoint = { month: string; average: number; count: number };
export type Evolution = { points: EvolutionPoint[] };
export type Coverage = { rows: { course: string; students: number; withMark: number }[] };
export type RankingRow = { position: number; student: Student; value: number; takenOn: string; diffFirst: number | null; vsPrevious: number | null; isRecentPb: boolean; courseAt: string };
export type HouseRow = { house: string; students: number; average: number; best: number };
export type Rankings = { rows: RankingRow[]; houses: HouseRow[]; schoolYears: number[] };
export type HistoricRecords = { records: BestByGender[] };
export type DisciplineCards = { cards: { disciplineId: string; count: number; best: number | null }[] };
export type ProgressRow = { student: Student; first: number; best: number; progress: number; marks: number };
export type Progress = { rows: ProgressRow[]; evolution: EvolutionPoint[]; schoolYears: number[] };
