// Solo para desarrollo local: importa la lista privada (private/alumnos-2026.csv) o, si no está, alumnos inventados,
// y carga marcas de prueba. Nunca correr contra producción.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { hashPassword } from "../src/server/lib/crypto";
import { db, sqlClient } from "../src/server/db/client";
import { ensureDisciplines } from "../src/server/db/bootstrap";
import { runMigrations } from "../src/server/db/migrate";
import { disciplines, marks, students, users } from "../src/server/db/schema";
import { parseRoster } from "../src/shared/domain/roster-import";
import { nameKey } from "../src/shared/domain/names";
import { personalBests } from "../src/shared/domain/marks";
import { COURSES, HOUSES } from "../src/shared/domain/school";

if (process.env.NODE_ENV === "production" || !/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("El seed de desarrollo solo corre contra una base local.");
}

const FAKE_FIRST = ["Ana", "Bruno", "Carla", "Dante", "Elena", "Franco", "Gina", "Hugo", "Inés", "Julián"];
const FAKE_LAST = ["Aguirre", "Bianchi", "Cabrera", "Domínguez", "Escobar", "Ferreyra", "Giménez", "Ibáñez", "Juárez", "Luna"];

await runMigrations();
await ensureDisciplines();

const password = await hashPassword("dev-password");
for (const [name, role] of [["Admin General", "superadmin"], ["Ada Admin", "admin"], ["Dora Docente", "teacher"]] as const) {
  const [first, ...rest] = name.split(" ");
  await db.insert(users).values({ username: name, usernameKey: nameKey(name), firstName: first!, lastName: rest.join(" "), role, mustChangePassword: false, passwordHash: password }).onConflictDoNothing();
}
const [teacher] = await db.select().from(users).limit(1);

if ((await db.select({ id: students.id }).from(students).limit(1)).length === 0) {
  const file = "private/alumnos-2026.csv";
  const rows = fs.existsSync(file)
    ? parseRoster(fs.readFileSync(file, "utf8")).rows.map((r) => ({ firstName: r.firstName, lastName: r.lastName, course: r.course, house: r.house as string, gender: r.gender as string | null }))
    : COURSES.flatMap((course) => FAKE_LAST.map((lastName, i) => ({ firstName: FAKE_FIRST[i]!, lastName, course, house: HOUSES[i % 3]! as string, gender: i % 2 ? "h" : "m" })));
  await db.insert(students).values(rows.map((r) => ({ ...r, nameKey: nameKey(`${r.firstName} ${r.lastName}`) })));
}

// Marcas de prueba para que se vean las estadísticas (3 de cada 4 alumnos, tres fechas)
const all = await db.select().from(students);
const list = await db.select().from(disciplines);
const year = new Date().getFullYear();
const dates = [`${year}-03-12`, `${year}-05-14`, `${year}-08-20`];
if ((await db.select({ id: marks.id }).from(marks).limit(1)).length === 0) {
  const rows: (typeof marks.$inferInsert)[] = [];
  all.forEach((s, si) => {
    if (si % 4 === 3) return;
    const y = Number(s.course[0]) + (s.course.endsWith("ES") ? 6 : 0);
    for (const d of list) {
      const base = d.name === "Salto en alto" ? 0.75 + y * 0.055 : d.name === "Salto en largo" ? 1.7 + y * 0.22 : d.name === "Velocidad 50 m" ? 11.6 - y * 0.32 : 480 - y * 16;
      const sign = d.better === "hi" ? 1 : -1;
      const step = d.kind === "ms" ? 8 : d.better === "lo" ? 0.2 : 0.03;
      const series = dates.map((_, i) => ({ value: Number((base + (((si * 7) % 11) - 5) * step * 0.6 + sign * i * step).toFixed(d.decimals)) }));
      personalBests(d, series).forEach(({ mark, isPb, delta }, i) => {
        rows.push({ studentId: s.id, disciplineId: d.id, value: mark.value, takenOn: dates[i]!, courseAt: s.course, isPb, pbDelta: delta, batchId: randomUUID(), createdBy: teacher!.id });
      });
    }
  });
  for (let i = 0; i < rows.length; i += 2000) await db.insert(marks).values(rows.slice(i, i + 2000));
  console.log(`marcas de prueba: ${rows.length}`);
}
console.log(`alumnos: ${all.length}. Usuarios: Admin General, Ada Admin, Dora Docente (dev-password).`);
await sqlClient.end();
