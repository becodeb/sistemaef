import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { anon, call, disciplineId, newStudent, newUser, save } from "./helpers";

describe("acceso", () => {
  it("sin sesión no se ve nada", async () => {
    for (const url of ["/students", "/marks", "/disciplines", "/stats/dashboard", "/admin/users"]) {
      expect((await call(anon(), "GET", url)).status).toBe(401);
    }
  });

  it("entra con nombre y apellido, sin importar mayúsculas ni tildes", async () => {
    await newUser("Juan Pérez");
    const a = anon();
    expect((await call(a, "POST", "/auth/login", { username: "  juan   perez ", password: "contraseña-inicial" })).status).toBe(200);
    expect((await call(a, "GET", "/auth/me")).body.username).toBe("Juan Pérez");
    expect((await call(anon(), "POST", "/auth/login", { username: "Juan Pérez", password: "otra" })).status).toBe(401);
  });

  it("obliga a cambiar la contraseña inicial antes de usar la app", async () => {
    const a = await newUser("Ana Paz", "teacher", { mustChange: true });
    const blocked = await call(a, "GET", "/students");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("must_change_password");
    expect((await call(a, "POST", "/auth/change-password", { current: "contraseña-inicial", next: "corta" })).status).toBe(400);
    expect((await call(a, "POST", "/auth/change-password", { current: "contraseña-inicial", next: "contraseña-inicial" })).status).toBe(400);
    expect((await call(a, "POST", "/auth/change-password", { current: "mal", next: "una-clave-nueva" })).status).toBe(400);
    expect((await call(a, "POST", "/auth/change-password", { current: "contraseña-inicial", next: "una-clave-nueva" })).status).toBe(200);
    expect((await call(a, "GET", "/students")).status).toBe(200);
  });

  it("el admin general crea cuentas de los tres roles y saca el acceso en el momento", async () => {
    const admin = await newUser("Admin Uno", "superadmin");
    for (const [firstName, role] of [["Ada", "admin"], ["Gina", "superadmin"], ["Dora", "teacher"]]) {
      const res = await call(admin, "POST", "/admin/users", { firstName, lastName: "Vega", role });
      expect(res.body.user.role).toBe(role);
    }
    const created = await call(admin, "POST", "/admin/users", { firstName: "Leo", lastName: "Luna" });
    expect(created.status).toBe(201);
    expect(created.body.user.username).toBe("Leo Luna");
    expect(created.body.user.mustChangePassword).toBe(true);
    expect(created.body.password.length).toBeGreaterThanOrEqual(8);
    expect((await call(admin, "POST", "/admin/users", { firstName: "leo", lastName: "LUNA" })).status).toBe(409);

    const leo = anon();
    expect((await call(leo, "POST", "/auth/login", { username: "Leo Luna", password: created.body.password })).status).toBe(200);
    await call(leo, "POST", "/auth/change-password", { current: created.body.password, next: "clave-de-leo-1" });
    expect((await call(leo, "GET", "/students")).status).toBe(200);

    expect((await call(admin, "PATCH", `/admin/users/${created.body.user.id}`, { active: false })).status).toBe(200);
    expect((await call(leo, "GET", "/students")).status).toBe(401);
    const denied = await call(anon(), "POST", "/auth/login", { username: "Leo Luna", password: "clave-de-leo-1" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("disabled");
  });

  it("el docente solo carga marcas y ve alumnos, en todos los cursos", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const profe = await newUser("Ana Paz");
    const alto = await disciplineId("Salto en alto");
    const a = await newStudent(admin, "Ana", "Aguirre", "6ES");
    const b = await newStudent(admin, "Bruno", "Bianchi", "1EP", "wind", "h");

    // Lo que sí puede
    expect((await call(profe, "GET", "/students")).body).toHaveLength(2);
    expect((await call(profe, "GET", `/students/${b}/profile`)).status).toBe(200);
    expect((await call(profe, "GET", `/roster?disciplineId=${alto}&group=c:1EP`)).status).toBe(200);
    expect((await save(profe, alto, "2026-04-01", [{ studentId: a, value: 1.2 }])).status).toBe(201);
    expect((await save(profe, alto, "2026-04-01", [{ studentId: b, value: 1.1 }])).status).toBe(201);

    // Lo que no
    for (const url of ["/stats/dashboard", `/stats/rankings?disciplineId=${alto}`, "/stats/records", `/stats/progress?disciplineId=${alto}`, "/admin/users", "/admin/disciplines"]) {
      expect((await call(profe, "GET", url)).status, url).toBe(403);
    }
    expect((await call(profe, "POST", "/students", { firstName: "A", lastName: "B", course: "1ES", house: "wind", gender: null })).status).toBe(403);
    expect((await call(profe, "PATCH", `/students/${a}`, { house: "water" })).status).toBe(403);
    expect((await call(profe, "POST", "/students/import", { rows: [{ line: 1, firstName: "A", lastName: "B", course: "1ES", house: "wind", gender: null }] })).status).toBe(403);
    expect((await call(profe, "PUT", `/students/${a}/goals/${alto}`, { target: 1.5 })).status).toBe(403);
    const [mark] = (await call(profe, "GET", "/marks")).body.marks;
    expect(mark.canDelete).toBe(false);
    expect((await call(profe, "DELETE", `/marks/${mark.id}`)).status).toBe(403);
  });

  it("el admin modifica datos y borra cargas, pero no crea usuarios", async () => {
    const admin = await newUser("Ada Vega", "admin");
    const a = await newStudent(admin, "Ana", "Aguirre", "6ES", "earth");
    const moved = await call(admin, "PATCH", `/students/${a}`, { house: "water", course: "5ES" });
    expect(moved.body).toMatchObject({ house: "water", course: "5ES" });
    expect((await call(admin, "GET", "/stats/dashboard")).status).toBe(200);
    expect((await call(admin, "GET", "/admin/disciplines")).status).toBe(200);
    expect((await call(admin, "GET", "/admin/users")).status).toBe(403);
    expect((await call(admin, "POST", "/admin/users", { firstName: "X", lastName: "Y" })).status).toBe(403);
  });

  it("no se puede quedar la plataforma sin admin general", async () => {
    const admin = await newUser("Admin Uno", "superadmin");
    const me = await call(admin, "GET", "/auth/me");
    expect((await call(admin, "PATCH", `/admin/users/${me.body.id}`, { active: false })).status).toBe(400);
    expect((await call(admin, "PATCH", `/admin/users/${me.body.id}`, { role: "admin" })).status).toBe(400);
  });

  it("resetear la contraseña corta las sesiones y vuelve a pedir el cambio", async () => {
    const admin = await newUser("Admin Uno", "superadmin");
    const profe = await newUser("Ana Paz");
    const list = await call(admin, "GET", "/admin/users");
    const id = list.body.find((u: any) => u.username === "Ana Paz").id;
    const reset = await call(admin, "POST", `/admin/users/${id}/reset-password`);
    expect(reset.body.user.mustChangePassword).toBe(true);
    expect((await call(profe, "GET", "/students")).status).toBe(401);
  });

  it("bloquea varios intentos fallidos seguidos", async () => {
    await newUser("Ana Paz");
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await call(anon(), "POST", "/auth/login", { username: "Ana Paz", password: "mal" })).status;
    expect(last).toBe(429);
  });
});

describe("marcas", () => {
  it("guarda varias marcas por alumno y detecta las personales", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const alto = await disciplineId("Salto en alto");
    const lu = await newStudent(admin, "Lucía", "Fernández");
    expect((await save(admin, alto, "2026-03-01", [{ studentId: lu, value: 1.3 }])).body.personalBests).toEqual([]);
    const second = await save(admin, alto, "2026-05-01", [{ studentId: lu, value: 1.35 }]);
    expect(second.body.personalBests[0].delta).toBeCloseTo(0.05);
    await save(admin, alto, "2026-05-01", [{ studentId: lu, value: 1.32 }]);
    const ctx = await call(admin, "GET", `/students/${lu}/context?disciplineId=${alto}`);
    expect(ctx.body.total).toBe(3);
    expect(ctx.body.best.value).toBe(1.35);
    const profile = await call(admin, "GET", `/students/${lu}/profile`);
    expect(profile.body.disciplines.find((d: any) => d.disciplineId === alto).marks).toHaveLength(3);
  });

  it("guarda una planilla entera, con ausentes, y un reintento no duplica", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const largo = await disciplineId("Salto en largo");
    const a = await newStudent(admin, "Ana", "Aguirre");
    const b = await newStudent(admin, "Bruno", "Bianchi", "6ES", "wind", "h");
    const batch = randomUUID();
    const entries = [{ studentId: a, value: 4.2 }, { studentId: b, value: null }];
    const first = await save(admin, largo, "2026-04-01", entries, batch);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ saved: 1, absent: 1 });
    expect((await save(admin, largo, "2026-04-01", entries, batch)).body).toMatchObject({ saved: 1, absent: 1 });
    const page = await call(admin, "GET", "/marks?limit=50");
    expect(page.body.total).toBe(2);
    expect(page.body.marks.find((m: any) => m.studentId === b).value).toBeNull();
    expect(page.body.marks[0].createdByName).toBe("Admin Uno");
  });

  it("rechaza valores imposibles, fechas futuras y alumnos dados de baja", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const alto = await disciplineId("Salto en alto");
    const a = await newStudent(admin, "Ana", "Aguirre");
    const impossible = await save(admin, alto, "2026-04-01", [{ studentId: a, value: 14 }]);
    expect(impossible.status).toBe(400);
    expect(impossible.body.error.message).toContain("¿Falta la coma?");
    expect((await save(admin, alto, "2099-01-01", [{ studentId: a, value: 1.2 }])).status).toBe(400);
    await call(admin, "PATCH", `/students/${a}`, { active: false });
    expect((await save(admin, alto, "2026-04-01", [{ studentId: a, value: 1.2 }])).status).toBe(400);
  });

  it("borrar o cargar con fecha vieja recalcula las marcas personales", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const vel = await disciplineId("Velocidad 50 m");
    const a = await newStudent(admin, "Ana", "Aguirre");
    await save(admin, vel, "2026-05-01", [{ studentId: a, value: 8 }]);
    await save(admin, vel, "2026-06-01", [{ studentId: a, value: 7.5 }]);
    const marks = async () => (await call(admin, "GET", `/students/${a}/profile`)).body.disciplines.find((d: any) => d.disciplineId === vel).marks;
    expect((await marks()).find((m: any) => m.value === 7.5).isPb).toBe(true);

    await save(admin, vel, "2026-03-01", [{ studentId: a, value: 7.2 }]);
    expect((await marks()).find((m: any) => m.value === 7.5).isPb).toBe(false);

    const old = (await marks()).find((m: any) => m.value === 7.2);
    expect((await call(admin, "DELETE", `/marks/${old.id}`)).status).toBe(200);
    expect((await marks()).find((m: any) => m.value === 7.5).isPb).toBe(true);
  });

  it("borrar una carga es solo de los admins, aunque la haya cargado el docente", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const profe = await newUser("Ana Paz");
    const alto = await disciplineId("Salto en alto");
    const a = await newStudent(admin, "Ana", "Aguirre");
    await save(profe, alto, "2026-04-01", [{ studentId: a, value: 1.2 }]);
    const [mark] = (await call(profe, "GET", "/marks")).body.marks;
    expect(mark.canDelete).toBe(false);
    expect((await call(profe, "DELETE", `/marks/${mark.id}`)).status).toBe(403);
    expect((await call(admin, "GET", "/marks")).body.marks[0].canDelete).toBe(true);
    expect((await call(admin, "DELETE", `/marks/${mark.id}`)).status).toBe(200);
  });
});

describe("grupos y estadísticas", () => {
  async function setup() {
    const admin = await newUser("Admin Uno", "admin");
    const alto = await disciplineId("Salto en alto");
    const ana = await newStudent(admin, "Ana", "Aguirre", "6ES", "earth", "m");
    const bruno = await newStudent(admin, "Bruno", "Bianchi", "6ES", "wind", "h");
    const carla = await newStudent(admin, "Carla", "Cabrera", "6ES", "earth", "m");
    const dante = await newStudent(admin, "Dante", "Domínguez", "5ES", "earth", "h");
    await save(admin, alto, "2026-03-01", [{ studentId: ana, value: 1.2 }, { studentId: bruno, value: 1.5 }, { studentId: carla, value: 1.3 }, { studentId: dante, value: 1.4 }]);
    await save(admin, alto, "2026-06-01", [{ studentId: ana, value: 1.35 }]);
    return { admin, alto, ana, bruno, carla, dante };
  }

  it("arma la lista por curso, por house y por sexo, en orden alfabético", async () => {
    const { admin, alto, bruno } = await setup();
    const names = async (q: string) => (await call(admin, "GET", `/roster?disciplineId=${alto}&${q}`)).body.students.map((s: any) => s.lastName);
    expect(await names("group=c:6ES")).toEqual(["Aguirre", "Bianchi", "Cabrera"]);
    expect(await names("group=h:earth")).toEqual(["Aguirre", "Cabrera", "Domínguez"]);
    expect(await names("group=c:6ES&gender=m")).toEqual(["Aguirre", "Cabrera"]);
    expect(await names("group=c:6ES&gender=h")).toEqual(["Bianchi"]);
    const roster = await call(admin, "GET", `/roster?disciplineId=${alto}&group=c:6ES`);
    expect(roster.body.students.find((s: any) => s.id === bruno).best.value).toBe(1.5);
    expect(roster.body.courseBest["6ES"]).toBe(1.5);
    expect((await call(admin, "GET", `/roster?disciplineId=${alto}&group=c:6N`)).status).toBe(400);
  });

  it("rankea por la mejor marca de cada alumno y separa por sexo", async () => {
    const { admin, alto } = await setup();
    const all = (await call(admin, "GET", `/stats/rankings?disciplineId=${alto}&schoolYear=2026&course=6ES`)).body;
    expect(all.rows.map((r: any) => [r.position, r.student.lastName, r.value])).toEqual([[1, "Bianchi", 1.5], [2, "Aguirre", 1.35], [3, "Cabrera", 1.3]]);
    expect(all.rows[1].diffFirst).toBeCloseTo(-0.15);
    expect(all.rows[1].vsPrevious).toBeCloseTo(0.15);
    const women = (await call(admin, "GET", `/stats/rankings?disciplineId=${alto}&schoolYear=2026&gender=m`)).body;
    expect(women.rows.map((r: any) => r.student.lastName)).toEqual(["Aguirre", "Cabrera"]);
    expect(all.houses[0].house).toBe("wind");
  });

  it("calcula el resumen, los récords, el avance y la carga por curso", async () => {
    const { admin, alto } = await setup();
    const dash = (await call(admin, "GET", "/stats/dashboard?schoolYear=2026")).body;
    expect(dash).toMatchObject({ students: 4, disciplines: 4, results: 5, personalBests: 1 });
    const row = dash.bestOfYear.find((b: any) => b.disciplineId === alto);
    expect(row.m.student.lastName).toBe("Aguirre");
    expect(row.h.student.lastName).toBe("Bianchi");
    expect(dash.highlights[0].delta).toBeCloseTo(0.15);

    const records = (await call(admin, "GET", "/stats/records")).body.records.find((b: any) => b.disciplineId === alto);
    expect(records.h.value).toBe(1.5);

    const progress = (await call(admin, "GET", `/stats/progress?disciplineId=${alto}&schoolYear=2026`)).body;
    expect(progress.rows[0].student.lastName).toBe("Aguirre");
    expect(progress.rows[0].progress).toBeCloseTo(0.15);
    expect(progress.evolution.map((p: any) => p.month)).toEqual(["2026-03", "2026-06"]);

    const coverage = (await call(admin, "GET", `/stats/coverage?disciplineId=${alto}&schoolYear=2026`)).body.rows;
    expect(coverage.find((r: any) => r.course === "6ES")).toEqual({ course: "6ES", students: 3, withMark: 3 });
    expect(coverage).toHaveLength(12);
  });

  it("guarda la meta de un alumno", async () => {
    const { admin, alto, ana } = await setup();
    await call(admin, "PUT", `/students/${ana}/goals/${alto}`, { target: 1.5 });
    const goal = async () => (await call(admin, "GET", `/students/${ana}/profile`)).body.disciplines.find((d: any) => d.disciplineId === alto).goal;
    expect(await goal()).toBe(1.5);
    await call(admin, "PUT", `/students/${ana}/goals/${alto}`, { target: null });
    expect(await goal()).toBeNull();
  });
});

describe("importar alumnos", () => {
  const row = (line: number, firstName: string, lastName: string, course = "6ES", house = "earth", gender: string | null = "m") => ({ line, firstName, lastName, course, house, gender });

  it("primero muestra qué haría y recién después guarda", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const rows = [row(2, "Ana", "Aguirre"), row(3, "Bruno", "Bianchi", "5EP", "wind", "h")];
    const preview = await call(admin, "POST", "/students/import", { dryRun: true, rows });
    expect(preview.body).toMatchObject({ dryRun: true, created: 2 });
    expect((await call(admin, "GET", "/students")).body).toHaveLength(0);
    expect((await call(admin, "POST", "/students/import", { rows })).body.created).toBe(2);
    expect((await call(admin, "GET", "/students")).body.map((s: any) => s.course)).toEqual(["6ES", "5EP"]);
  });

  it("al reimportar actualiza curso y house sin duplicar, y no borra el sexo ya definido", async () => {
    const admin = await newUser("Admin Uno", "admin");
    await newStudent(admin, "Ana", "Aguirre", "5ES", "earth", "m");
    const res = await call(admin, "POST", "/students/import", { rows: [row(2, "ANA", "Aguirre", "6ES", "water", null)] });
    expect(res.body).toMatchObject({ created: 0, updated: 1 });
    const [ana] = (await call(admin, "GET", "/students")).body;
    expect(ana).toMatchObject({ course: "6ES", house: "water", gender: "m" });
    expect((await call(admin, "POST", "/students/import", { rows: [row(2, "Ana", "Aguirre", "6ES", "water", null)] })).body.same).toBe(1);
  });

  it("no pisa cuando hay dos alumnos con el mismo nombre", async () => {
    const admin = await newUser("Admin Uno", "admin");
    await newStudent(admin, "Ana", "Paz", "5ES");
    await newStudent(admin, "Ana", "Paz", "6ES");
    const res = await call(admin, "POST", "/students/import", { rows: [row(2, "Ana", "Paz", "1EP")] });
    expect(res.body.ambiguous).toBe(1);
    expect(res.body.rows[0].detail).toContain("1EP");
  });

  it("no acepta cursos que no existen ni datos de un profe", async () => {
    const admin = await newUser("Admin Uno", "admin");
    const profe = await newUser("Ana Paz");
    expect((await call(admin, "POST", "/students/import", { rows: [row(2, "A", "B", "K5")] })).status).toBe(400);
    expect((await call(profe, "POST", "/students/import", { rows: [row(2, "A", "B")] })).status).toBe(403);
  });

  it("filtra a los que tienen el sexo sin definir", async () => {
    const admin = await newUser("Admin Uno", "admin");
    await newStudent(admin, "Ana", "Aguirre");
    await newStudent(admin, "Noah", "Paz", "6ES", "wind", null);
    const rows = (await call(admin, "GET", "/students?gender=sin")).body;
    expect(rows.map((s: any) => s.firstName)).toEqual(["Noah"]);
  });
});
