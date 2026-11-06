import { describe, expect, it } from "vitest";
import { cleanRaw, fmtMark, fmtSigned, parseEntry, personalBests, type DisciplineDef } from "./marks";
import { parseCourse, parseRoster } from "./roster-import";
import { nameKey } from "./names";
import { COURSES, GROUPS, courseLabel, courseName, todayAR } from "./school";

const alto: DisciplineDef = { name: "Salto en alto", what: "Altura", kind: "dec", unit: "m", better: "hi", decimals: 2, lo: 0.6, hi: 2.3, example: "1,35", hint: null };
const res: DisciplineDef = { name: "Resistencia 1000 m", what: "Tiempo", kind: "ms", unit: "min", better: "lo", decimals: 0, lo: 150, hi: 900, example: "4:35", hint: null };

describe("parseEntry", () => {
  it("acepta coma y punto", () => {
    expect(parseEntry(alto, "1,45").value).toBe(1.45);
    expect(parseEntry(alto, "1.5").value).toBe(1.5);
  });
  it("frena un valor imposible y avisa de la coma", () => {
    const p = parseEntry(alto, "142");
    expect(p.ok).toBeUndefined();
    expect(p.err).toContain("¿Falta la coma?");
  });
  it("rechaza lo que no es un número", () => {
    expect(parseEntry(alto, "1,4x").err).toContain("solo el número");
  });
  it("entiende los ausentes", () => {
    for (const raw of ["a", "A", "aus", "ausente"]) expect(parseEntry(alto, raw).absent).toBe(true);
  });
  it("vacío no es error", () => {
    expect(parseEntry(alto, "  ").empty).toBe(true);
  });
  it("lee tiempos con dos puntos y sin separador", () => {
    expect(parseEntry(res, "4:35").value).toBe(275);
    expect(parseEntry(res, "435").value).toBe(275);
    expect(parseEntry(res, "10:05").value).toBe(605);
    expect(parseEntry(res, "4:61").err).toContain("segundos");
  });
});

describe("formato", () => {
  it("cleanRaw deja prolijo", () => {
    expect(cleanRaw(alto, "1,4")).toBe("1,40");
    expect(cleanRaw(res, "435")).toBe("4:35");
    expect(cleanRaw(alto, "aus")).toBe("A");
    expect(cleanRaw(alto, "142")).toBe("142");
  });
  it("muestra la unidad", () => {
    expect(fmtMark(1.45, alto)).toBe("1,45 m");
    expect(fmtMark(275, res)).toBe("4:35 min");
    expect(fmtSigned(-9, res)).toBe("−9 s");
    expect(fmtSigned(0.04, alto)).toBe("+0,04 m");
  });
});

describe("personalBests", () => {
  it("marca solo lo que supera la mejor anterior e ignora ausentes", () => {
    const out = personalBests(alto, [{ value: 1.3 }, { value: null }, { value: 1.28 }, { value: 1.35 }, { value: 1.35 }]);
    expect(out.map((o) => o.isPb)).toEqual([false, false, false, true, false]);
    expect(out[3]!.delta).toBeCloseTo(0.05);
  });
  it("en tiempos, menos es mejor", () => {
    const out = personalBests(res, [{ value: 300 }, { value: 280 }, { value: 290 }]);
    expect(out.map((o) => o.isPb)).toEqual([false, true, false]);
  });
});

describe("parseRoster", () => {
  it("lee lo pegado desde Excel con encabezado", () => {
    const { rows, errors } = parseRoster("Apellido\tNombre\tCurso\tHouse\tSexo\nPérez\tJuan\t4ES\tEarth\tHombre\nDíaz\tAna\t1EP\twater\tMujer");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ lastName: "Pérez", firstName: "Juan", course: "4ES", house: "earth", gender: "h" });
    expect(rows[1]).toMatchObject({ course: "1EP", house: "water", gender: "m" });
  });
  it("funciona sin encabezado, con punto y coma y con BOM", () => {
    expect(parseRoster("﻿Luna;Mía;6ES;Wind;M").rows[0]).toMatchObject({ course: "6ES", house: "wind", gender: "m" });
  });
  it("deja sin definir el sexo que viene vacío, sin error", () => {
    const { rows, errors } = parseRoster("Apellido;Nombre;Curso;House;Sexo\nPaz;Noah;3EP;Wind;");
    expect(errors).toEqual([]);
    expect(rows[0]!.gender).toBeNull();
  });
  it("explica cada error con su línea", () => {
    const { errors } = parseRoster("Pérez\tJuan\t7ES\tFuego\tOtro");
    expect(errors[0]!.line).toBe(1);
    for (const part of ["7ES", "Fuego", "Otro"]) expect(errors[0]!.message).toContain(part);
  });
  it("no acepta K5 ni divisiones N, F o S", () => {
    expect(parseCourse("K5")).toBeNull();
    expect(parseCourse("6N")).toBeNull();
  });
  it("entiende el curso escrito de varias formas", () => {
    for (const raw of ["6ES", "6 ES", "6es", "6to ES", "6° ES", "6.º Secundaria", "6to año de secundaria"]) expect(parseCourse(raw)).toBe("6ES");
    expect(parseCourse("3° EP")).toBe("3EP");
  });
});

describe("colegio", () => {
  it("tiene 12 cursos y 3 houses, sin divisiones", () => {
    expect(COURSES).toHaveLength(12);
    expect(GROUPS.filter((g) => g.type === "house").map((g) => g.short)).toEqual(["Earth", "Wind", "Water"]);
  });
  it("nombra los cursos", () => {
    expect(courseLabel("6ES")).toBe("6.º ES");
    expect(courseName("3EP")).toBe("3.º año de primaria");
  });
  it("usa la fecha de Argentina", () => {
    expect(todayAR(new Date("2026-11-07T01:30:00Z"))).toBe("2026-11-06");
  });
  it("normaliza nombres de usuario", () => {
    expect(nameKey("  Juan   PÉREZ ")).toBe("juan perez");
  });
});
