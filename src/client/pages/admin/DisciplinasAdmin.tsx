import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Discipline } from "@shared/contracts";
import { fmtNumber, fmtTime, unitName } from "@shared/domain/marks";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { refreshData, useApi } from "../../lib/hooks";

const UNITS = [
  ["m", "Metros"],
  ["cm", "Centímetros"],
  ["s", "Segundos"],
  ["min", "Minutos y segundos"],
  ["rep", "Repeticiones"],
] as const;

/** Un límite escrito por el admin: 4:35 en tiempos largos, un número en lo demás. */
function parseLimit(raw: string, unit: string): number | null {
  const t = raw.trim();
  if (unit === "min") {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  const n = Number(t.replace(",", "."));
  return t !== "" && Number.isFinite(n) ? n : null;
}
const showLimit = (v: number, d: Discipline) => (d.kind === "ms" ? fmtTime(v) : fmtNumber(v, d.decimals));

export function DisciplinasAdmin() {
  const { data, isLoading, error, refetch } = useApi<Discipline[]>("/api/admin/disciplines");
  const [form, setForm] = useState({ name: "", what: "", unit: "m", better: "hi", lo: "", hi: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFields({});
    setFormError(null);
    const lo = parseLimit(form.lo, form.unit);
    const hi = parseLimit(form.hi, form.unit);
    if (lo == null || hi == null) {
      setFields({ lo: form.unit === "min" ? "Escribí los límites como 2:30." : "Escribí los límites con números." });
      return;
    }
    try {
      await api.post("/api/admin/disciplines", { name: form.name, what: form.what, unit: form.unit, better: form.better, lo, hi });
      toast.success(`Disciplina agregada: ${form.name}`);
      setForm({ name: "", what: "", unit: "m", better: "hi", lo: "", hi: "" });
      void refreshData();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else setFormError((err as Error).message);
    }
  };
  const patch = async (d: Discipline, body: Partial<Discipline>) => {
    try {
      await api.patch(`/api/admin/disciplines/${d.id}`, body);
      void refreshData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Disciplinas" sub="Qué se mide en cada una y qué valores son posibles." />
      <div className="card">
        <h2>Nueva disciplina</h2>
        <form className="form-grid" onSubmit={create}>
          <div>
            <label className="lbl" htmlFor="d-name">Nombre</label>
            <input className="inp" id="d-name" placeholder="Lanzamiento de bala" value={form.name} onChange={(e) => set("name")(e.target.value)} required />
            {fields.name && <p className="form-err">{fields.name}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="d-what">Qué se mide</label>
            <input className="inp" id="d-what" placeholder="Distancia" value={form.what} onChange={(e) => set("what")(e.target.value)} required />
            {fields.what && <p className="form-err">{fields.what}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="d-unit">Unidad</label>
            <select className="sel" id="d-unit" value={form.unit} onChange={(e) => set("unit")(e.target.value)}>{UNITS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </div>
          <div>
            <label className="lbl" htmlFor="d-better">Es mejor</label>
            <select className="sel" id="d-better" value={form.better} onChange={(e) => set("better")(e.target.value)}>
              <option value="hi">Más (distancia, altura)</option>
              <option value="lo">Menos (tiempo)</option>
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="d-lo">Mínimo posible</label>
            <input className="inp" id="d-lo" inputMode="decimal" placeholder={form.unit === "min" ? "2:30" : "1"} value={form.lo} onChange={(e) => set("lo")(e.target.value)} required />
            {fields.lo && <p className="form-err">{fields.lo}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="d-hi">Máximo posible</label>
            <input className="inp" id="d-hi" inputMode="decimal" placeholder={form.unit === "min" ? "15:00" : "20"} value={form.hi} onChange={(e) => set("hi")(e.target.value)} required />
            {fields.hi && <p className="form-err">{fields.hi}</p>}
          </div>
          <div className="form-end"><button className="btn pri" type="submit">Agregar</button></div>
        </form>
        {formError && <p className="form-err" role="alert">{formError}</p>}
        <p className="hint">Los límites frenan errores de tipeo, como escribir 142 en lugar de 1,42. La unidad y el criterio no se pueden cambiar después, porque las marcas ya cargadas dependen de ellos.</p>
      </div>
      <div className="card">
        <h2>Disciplinas cargadas</h2>
        {isLoading && <Loading />}
        {error && !data && <ErrorBox error={error} retry={() => void refetch()} />}
        {data && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Disciplina</th><th>Se mide</th><th>Es mejor</th><th>Rango posible</th><th>Marcas</th><th /></tr></thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id} className={d.active ? "" : "row-off"}>
                    <td>{d.name}</td>
                    <td>{d.what} · {unitName(d)}</td>
                    <td>{d.better === "hi" ? "Más" : "Menos"}</td>
                    <td className="num nowrap">{showLimit(d.lo, d)} a {showLimit(d.hi, d)} {d.unit}</td>
                    <td className="num">{d.markCount ?? 0}</td>
                    <td className="row-actions"><button className="btn small" type="button" onClick={() => void patch(d, { active: !d.active })}>{d.active ? "Desactivar" : "Activar"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
