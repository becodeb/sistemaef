import { fmtDiff, fmtSigned, isBetter, type DisciplineDef, type Parsed } from "@shared/domain/marks";

/** Lo que se le dice al profe mientras escribe: error, marca personal o cuánto le faltó. */
export function Verdict({ d, parsed, best }: { d: DisciplineDef; parsed: Parsed; best: number | null | undefined }) {
  if (parsed.err) return <span className="chip warn">{parsed.err}</span>;
  if (parsed.absent) return <span className="chip">Queda registrado como ausente. Podés tomarle la marca en otra clase.</span>;
  if (!parsed.ok) return null;
  if (best == null) return <span className="chip">Primera marca en {d.name.toLowerCase()}</span>;
  const value = parsed.value!;
  if (isBetter(d, value, best)) return <span className="chip pb">Nueva marca personal · {fmtSigned(value - best, d)}</span>;
  if (value === best) return <span className="chip">Igualó su mejor marca</span>;
  return <span className="chip">A {fmtDiff(value - best, d)} de su mejor marca</span>;
}
