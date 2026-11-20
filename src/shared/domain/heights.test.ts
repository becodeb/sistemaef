import { describe, expect, it } from "vitest";
import { advancing, attemptsError, heightLines, marksFrom, nextHeightError, nextRound, queueOf, record, roundDone, startSession, undo, type JumpSession } from "./heights";

const play = (s: JumpSession, steps: [string, Parameters<typeof record>[2]][]) => steps.reduce((acc, [id, r]) => record(acc, id, r), s);

describe("salto en alto por alturas", () => {
  it("el ejemplo: A saltó, B nulo y otro intento y saltó, C nulo y no sigue, D ausente, E saltó", () => {
    let s = startSession(1.2, ["A", "B", "C", "D", "E"]);
    s = play(s, [["A", "cleared"], ["B", "retry"]]);
    // B pasa al final de los que faltan.
    expect(queueOf(s)).toEqual(["C", "D", "E", "B"]);
    s = play(s, [["C", "out"], ["D", "absent"], ["E", "cleared"]]);
    expect(roundDone(s)).toBe(false);
    s = record(s, "B", "cleared");
    expect(roundDone(s)).toBe(true);
    expect(advancing(s)).toEqual(["A", "B", "E"]);

    expect(nextHeightError(s, 1.2)).not.toBeNull();
    s = nextRound(s, 1.25);
    expect(queueOf(s)).toEqual(["A", "B", "E"]);
    s = play(s, [["A", "cleared"], ["B", "out"], ["E", "retry"], ["E", "out"]]);
    expect(advancing(s)).toEqual(["A"]);

    expect(attemptsError(s.attempts)).toBeNull();
    expect(marksFrom(s.attempts)).toEqual([
      { studentId: "A", value: 1.25 },
      { studentId: "B", value: 1.2 },
      { studentId: "D", value: null },
      { studentId: "E", value: 1.2 },
    ]);
    expect(heightLines(s.attempts.filter((a) => a.studentId === "E"))).toEqual([
      { round: 1, height: 1.2, tries: ["cleared"], result: "cleared" },
      { round: 2, height: 1.25, tries: ["retry", "out"], result: "out" },
    ]);
  });

  it("no se anota a alguien que ya terminó esa altura, y deshacer vuelve atrás solo en la altura actual", () => {
    let s = startSession(1, ["A", "B"]);
    s = record(s, "A", "cleared");
    expect(record(s, "A", "out")).toBe(s);
    s = undo(s);
    expect(queueOf(s)).toEqual(["A", "B"]);
    s = play(s, [["A", "cleared"], ["B", "cleared"]]);
    s = nextRound(s, 1.05);
    expect(undo(s)).toBe(s);
  });

  it("el servidor rechaza intentos que no siguen las reglas", () => {
    const a = (studentId: string, round: number, height: number, seq: number, result: "cleared" | "retry" | "out" | "absent") => ({ studentId, round, height, seq, result });
    expect(attemptsError([a("A", 1, 1.2, 1, "out"), a("A", 2, 1.25, 1, "cleared")])).toMatch(/sin haber superado/);
    expect(attemptsError([a("A", 1, 1.2, 1, "cleared"), a("B", 1, 1.25, 1, "cleared")])).toMatch(/dos alturas/);
    expect(attemptsError([a("A", 1, 1.2, 1, "cleared"), a("A", 2, 1.1, 1, "cleared")])).toMatch(/más alta/);
    expect(attemptsError([a("A", 1, 1.2, 1, "cleared"), a("A", 1, 1.2, 2, "cleared")])).toMatch(/después/);
    expect(attemptsError([a("A", 1, 1.2, 2, "cleared")])).toMatch(/salteados/);
    expect(attemptsError([a("A", 2, 1.2, 1, "cleared")])).toMatch(/Falta/);
    // Una clase cortada a mitad de una altura: el último intento puede quedar como «otro intento».
    expect(attemptsError([a("A", 1, 1.2, 1, "retry")])).toBeNull();
  });

  it("quien no superó la altura inicial no tiene marca", () => {
    expect(marksFrom([{ studentId: "C", round: 1, height: 1.2, seq: 1, result: "out" }])).toEqual([]);
  });
});
