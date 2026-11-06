import { sql } from "drizzle-orm";
import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { Role } from "@shared/domain/roles";

const ts = () => timestamp({ withTimezone: true });

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  /** El usuario es nombre y apellido; `usernameKey` lo compara sin mayúsculas ni tildes. */
  username: text().notNull(),
  usernameKey: text().notNull().unique(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  role: text().$type<Role>().notNull().default("teacher"),
  /** Sin esto no entra: así se limita quién tiene acceso. */
  active: boolean().notNull().default(true),
  mustChangePassword: boolean().notNull().default(true),
  passwordHash: text().notNull(),
  lastLoginAt: ts(),
  createdAt: ts().notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text().primaryKey(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts().notNull(),
  createdAt: ts().notNull().defaultNow(),
});

export const students = pgTable(
  "students",
  {
    id: uuid().primaryKey().defaultRandom(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    nameKey: text().notNull(),
    /** Año y nivel, sin división: 6ES, 3EP. */
    course: text().notNull(),
    house: text().notNull(),
    /** m o h; null mientras no esté definido. */
    gender: text(),
    active: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("students_active_name_course").on(t.nameKey, t.course).where(sql`${t.active}`),
    index("students_course").on(t.course),
    index("students_house").on(t.house),
  ],
);

export const disciplines = pgTable("disciplines", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  what: text().notNull(),
  kind: text().$type<"dec" | "ms">().notNull(),
  unit: text().notNull(),
  better: text().$type<"hi" | "lo">().notNull(),
  decimals: smallint().notNull().default(2),
  lo: doublePrecision().notNull(),
  hi: doublePrecision().notNull(),
  example: text().notNull(),
  hint: text(),
  icon: text().notNull().default("otra"),
  sort: integer().notNull().default(100),
  active: boolean().notNull().default(true),
  createdAt: ts().notNull().defaultNow(),
});

export const marks = pgTable(
  "marks",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid().notNull().references(() => students.id, { onDelete: "cascade" }),
    disciplineId: uuid().notNull().references(() => disciplines.id, { onDelete: "restrict" }),
    /** Null: estuvo ausente. Los tiempos van en segundos. */
    value: doublePrecision(),
    takenOn: date({ mode: "string" }).notNull(),
    /** El curso que tenía al tomarse la marca: los rankings de años anteriores no cambian al pasar de año. */
    courseAt: text().notNull(),
    isPb: boolean().notNull().default(false),
    pbDelta: doublePrecision(),
    /** Identifica un envío: si el teléfono reintenta por mala señal, no se duplica nada. */
    batchId: uuid().notNull(),
    createdBy: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("marks_batch_student").on(t.batchId, t.studentId),
    index("marks_student_discipline").on(t.studentId, t.disciplineId, t.takenOn),
    index("marks_discipline_date").on(t.disciplineId, t.takenOn),
    index("marks_created").on(t.createdAt),
  ],
);

export const goals = pgTable(
  "goals",
  {
    studentId: uuid().notNull().references(() => students.id, { onDelete: "cascade" }),
    disciplineId: uuid().notNull().references(() => disciplines.id, { onDelete: "cascade" }),
    target: doublePrecision().notNull(),
    setBy: uuid().notNull().references(() => users.id, { onDelete: "restrict" }),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.disciplineId] })],
);

export const auditLogs = pgTable("audit_logs", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().references(() => users.id, { onDelete: "set null" }),
  action: text().notNull(),
  entityId: text(),
  meta: jsonb().$type<Record<string, unknown>>(),
  createdAt: ts().notNull().defaultNow(),
});
