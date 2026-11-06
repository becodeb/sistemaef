// Cómo se escribe, se valida y se compara una marca. Lo usan el cliente (mientras se tipea) y el servidor (al guardar).
export type DisciplineDef = {
  name: string;
  what: string;
  /** "dec": un número con decimales. "ms": minutos y segundos, guardado en segundos. */
  kind: "dec" | "ms";
  unit: string;
  better: "hi" | "lo";
  decimals: number;
  lo: number;
  hi: number;
  example: string;
  hint: string | null;
};

export type Parsed = { empty?: boolean; err?: string; ok?: boolean; absent?: boolean; value?: number };

export const isBetter = (d: Pick<DisciplineDef, "better">, a: number, b: number) => (d.better === "hi" ? a > b : a < b);

export function fmtNumber(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(".", ",");
}
export function fmtTime(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
/** Sin unidad: lo que se ve dentro de la celda. */
export function fmtValue(value: number, d: DisciplineDef): string {
  return d.kind === "ms" ? fmtTime(value) : fmtNumber(value, d.decimals);
}
export function fmtMark(value: number, d: DisciplineDef): string {
  return `${fmtValue(value, d)} ${d.unit}`;
}
/** Una diferencia: en tiempos largos se cuenta en segundos. */
export function fmtDiff(delta: number, d: DisciplineDef): string {
  const abs = Math.abs(delta);
  return d.kind === "ms" ? `${Math.round(abs)} s` : `${fmtNumber(abs, d.decimals)} ${d.unit}`;
}
export function fmtSigned(delta: number, d: DisciplineDef): string {
  return `${delta > 0 ? "+" : "−"}${fmtDiff(delta, d)}`;
}

export function unitName(d: Pick<DisciplineDef, "kind" | "unit">): string {
  if (d.kind === "ms") return "minutos y segundos";
  return ({ m: "metros", s: "segundos", cm: "centímetros", rep: "repeticiones" } as Record<string, string>)[d.unit] ?? d.unit;
}

export function hintFor(d: DisciplineDef): string {
  if (d.hint) return d.hint;
  if (d.kind === "ms") return `Minutos y segundos del cronómetro. Por ejemplo: ${d.example}`;
  return `${d.what} en ${unitName(d)}. Por ejemplo: ${d.example}`;
}

/** Revisa que un valor ya numérico sea posible para la disciplina. Devuelve el mensaje de error o null. */
export function rangeError(value: number, d: DisciplineDef): string | null {
  if (value >= d.lo && value <= d.hi) return null;
  const name = d.name.toLowerCase();
  if (d.kind === "ms") return `${fmtTime(value)} min está fuera de lo esperable para ${name} (entre ${fmtTime(d.lo)} y ${fmtTime(d.hi)} min). Revisá el cronómetro.`;
  const comma = d.decimals > 0 ? " ¿Falta la coma?" : "";
  return `${fmtMark(value, d)} está fuera de lo esperable para ${name} (entre ${fmtMark(d.lo, d)} y ${fmtMark(d.hi, d)}).${comma}`;
}

/** Lo que escribió el profe: un número con coma o punto, 4:35 o 435 en tiempos, o A si faltó. */
export function parseEntry(d: DisciplineDef, raw: string | null | undefined): Parsed {
  const t = (raw ?? "").trim();
  if (t === "") return { empty: true };
  if (/^a(us(ente)?)?$/i.test(t)) return { ok: true, absent: true };
  let value: number;
  if (d.kind === "ms") {
    const m = t.match(/^(\d{1,2})[:.,](\d{1,2})$/) ?? t.match(/^(\d{1,2})(\d{2})$/);
    if (!m) return { err: `Escribí minutos y segundos. Por ejemplo: ${d.example}` };
    if (Number(m[2]) > 59) return { err: "Los segundos van de 0 a 59." };
    value = Number(m[1]) * 60 + Number(m[2]);
  } else {
    const n = t.replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(n)) return { err: `Escribí solo el número, con coma para los decimales. Por ejemplo: ${d.example}` };
    value = Number(Number(n).toFixed(d.decimals));
  }
  const err = rangeError(value, d);
  return err ? { err } : { ok: true, value };
}

/** Deja prolijo lo escrito: 435 pasa a 4:35, 1,4 a 1,40 y aus a A. */
export function cleanRaw(d: DisciplineDef, raw: string | null | undefined): string {
  const p = parseEntry(d, raw);
  if (!p.ok) return raw ?? "";
  return p.absent ? "A" : fmtValue(p.value!, d);
}

/** Recorre las marcas en orden y dice cuáles superaron la mejor anterior y por cuánto. La primera no cuenta. */
export function personalBests<T extends { value: number | null }>(d: Pick<DisciplineDef, "better">, chrono: T[]): { mark: T; isPb: boolean; delta: number | null }[] {
  let best: number | null = null;
  return chrono.map((mark) => {
    if (mark.value == null) return { mark, isPb: false, delta: null };
    const isPb = best != null && isBetter(d, mark.value, best);
    const delta = isPb ? mark.value - best! : null;
    if (best == null || isPb) best = mark.value;
    return { mark, isPb, delta };
  });
}
