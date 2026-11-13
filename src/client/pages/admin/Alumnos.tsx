import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { ImportResult, Student } from "@shared/contracts";
import { COURSES, GENDER_ONE, HOUSES, HOUSE_NAMES, courseLabel } from "@shared/domain/school";
import { listName, matchesName } from "@shared/domain/names";
import { parseRoster, type RosterError, type RosterRow } from "@shared/domain/roster-import";
import { Confirm, CourseOptions, Empty, ErrorBox, HouseOptions, Icon, Loading, PageHead, Pick } from "../../components/ui";
import { ApiError, api, withQuery } from "../../lib/api";
import { refreshData, useApi } from "../../lib/hooks";

const STEP = 60;
const ACTIONS = { create: "Nuevo", update: "Cambia", ambiguous: "Revisar", same: "Igual" } as const;

function Importar() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [errors, setErrors] = useState<RosterError[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const check = async (source: string) => {
    const parsed = parseRoster(source);
    setRows(parsed.rows);
    setErrors(parsed.errors);
    setPreview(null);
    setFailure(null);
    if (!parsed.rows.length) return;
    setBusy(true);
    try {
      setPreview(await api.post<ImportResult>("/api/students/import", { dryRun: true, rows: parsed.rows }));
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!rows) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await api.post<ImportResult>("/api/students/import", { rows });
      toast.success(`Importados: ${res.created} nuevos y ${res.updated} actualizados`);
      setText("");
      setRows(null);
      setErrors([]);
      setPreview(null);
      void refreshData();
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Importar la lista</h2>
      <p className="sub">Elegí un archivo CSV o pegá desde Excel estas columnas: Apellido, Nombre, Curso (6ES, 3EP), House (Earth, Wind, Water) y Sexo (Mujer, Hombre o vacío). Si el alumno ya existe, se actualiza su curso y su house.</p>
      <div className="import-tools">
        <label className="btn file-btn">
          Elegir archivo CSV
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then((content) => {
                setText(content);
                void check(content);
              });
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <label className="lbl" htmlFor="imp-text">O pegá la lista acá</label>
      <textarea className="inp textarea" id="imp-text" rows={5} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setRows(null); }} placeholder={"Apellido\tNombre\tCurso\tHouse\tSexo"} />
      <div className="actions">
        <button className="btn" type="button" disabled={!text.trim() || busy} onClick={() => void check(text)}>Revisar la lista</button>
      </div>
      {errors.length > 0 && (
        <div className="notice is-err" role="alert">
          <div>
            <p><b>{errors.length} {errors.length === 1 ? "línea no se puede leer" : "líneas no se pueden leer"}.</b> No se importan: corregilas y volvé a revisar.</p>
            <ul className="small">{errors.slice(0, 20).map((e) => <li key={e.line}>Línea {e.line}: {e.message}</li>)}</ul>
            {errors.length > 20 && <p className="small">Y {errors.length - 20} más.</p>}
          </div>
        </div>
      )}
      {failure && <p className="form-err" role="alert">{failure}</p>}
      {preview && (
        <div className="preview">
          <h3>Esto va a pasar</h3>
          <div className="g-sum left">
            <div><b className="num">{preview.created}</b><span>nuevos</span></div>
            <div><b className="num">{preview.updated}</b><span>cambian</span></div>
            <div><b className="num">{preview.same}</b><span>sin cambios</span></div>
            <div><b className="num">{preview.ambiguous}</b><span>para revisar</span></div>
          </div>
          {preview.rows.some((r) => r.action !== "create") && (
            <ul className="small preview-list">
              {preview.rows.filter((r) => r.action !== "create").slice(0, 50).map((r) => <li key={r.line}><b>{ACTIONS[r.action]}:</b> {r.name}{r.detail ? ` · ${r.detail}` : ""}</li>)}
            </ul>
          )}
          <div className="actions">
            <button className="btn pri" type="button" disabled={busy || preview.created + preview.updated === 0} onClick={() => void confirm()}>{busy ? "Importando…" : `Importar ${preview.created + preview.updated}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NuevoAlumno({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", course: "1ES", house: "earth", gender: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFields({});
    setError(null);
    try {
      await api.post("/api/students", { ...form, gender: form.gender || null });
      toast.success(`Alumno agregado: ${form.lastName}, ${form.firstName}`);
      setForm((f) => ({ ...f, firstName: "", lastName: "" }));
      onDone();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else setError((err as Error).message);
    }
  };
  return (
    <div className="card">
      <h2>Agregar un alumno</h2>
      <form className="form-grid" onSubmit={submit}>
        <div>
          <label className="lbl" htmlFor="n-last">Apellido</label>
          <input className="inp" id="n-last" autoComplete="off" value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} required />
          {fields.lastName && <p className="form-err">{fields.lastName}</p>}
        </div>
        <div>
          <label className="lbl" htmlFor="n-first">Nombre</label>
          <input className="inp" id="n-first" autoComplete="off" value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} required />
          {fields.firstName && <p className="form-err">{fields.firstName}</p>}
        </div>
        <Pick id="n-course" label="Curso" value={form.course} onChange={set("course")}><CourseOptions /></Pick>
        <Pick id="n-house" label="House" value={form.house} onChange={set("house")}><HouseOptions /></Pick>
        <Pick id="n-gender" label="Sexo" value={form.gender} onChange={set("gender")}>
          <option value="">Sin definir</option>
          <option value="m">Mujer</option>
          <option value="h">Hombre</option>
        </Pick>
        <div className="form-end"><button className="btn pri" type="submit">Agregar</button></div>
      </form>
      {error && <p className="form-err" role="alert">{error}</p>}
    </div>
  );
}

export function Alumnos() {
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("");
  const [house, setHouse] = useState("");
  const [gender, setGender] = useState("");
  const [inactive, setInactive] = useState(false);
  const [shown, setShown] = useState(STEP);
  const [toRemove, setToRemove] = useState<Student | null>(null);
  const { data, isLoading, error, refetch } = useApi<Student[]>(withQuery("/api/students", { course, house, gender, inactive: inactive ? 1 : null }));
  const all = useApi<Student[]>("/api/students");
  const undefinedCount = all.data?.filter((s) => !s.gender).length ?? 0;
  const rows = useMemo(() => (q.trim() ? (data ?? []).filter((s) => matchesName(s, q)) : (data ?? [])), [data, q]);

  const patch = async (s: Student, body: Partial<Student>) => {
    try {
      await api.patch(`/api/students/${s.id}`, body);
      void refreshData();
    } catch (err) {
      toast.error((err as Error).message);
      void refreshData();
    }
  };

  return (
    <>
      <PageHead title="Alumnos" sub={all.data ? `${all.data.length} alumnos activos` : undefined} />
      <Importar />
      <NuevoAlumno onDone={() => void refreshData()} />
      {undefinedCount > 0 && (
        <div className="notice">
          <p><b>{undefinedCount} {undefinedCount === 1 ? "alumno tiene" : "alumnos tienen"} el sexo sin definir.</b> Hasta que lo definas no aparecen en las listas separadas por mujeres y hombres.</p>
          <button className="btn" type="button" onClick={() => { setGender("sin"); setShown(STEP); }}>Ver cuáles</button>
        </div>
      )}
      <div className="card">
        <h2>Lista de alumnos</h2>
        <p className="sub">Los cambios se guardan al elegir. Las marcas viejas conservan el curso que tenían cuando se tomaron.</p>
        <div className="filters">
          <div className="pick grow">
            <label className="lbl" htmlFor="al-q">Buscar</label>
            <div className="search"><Icon name="search" /><input id="al-q" type="text" autoComplete="off" placeholder="Nombre o apellido" value={q} onChange={(e) => { setQ(e.target.value); setShown(STEP); }} /></div>
          </div>
          <Pick id="al-course" label="Curso" value={course} onChange={setCourse}><CourseOptions all="Todos" /></Pick>
          <Pick id="al-house" label="House" value={house} onChange={setHouse}><HouseOptions all="Todos" /></Pick>
          <Pick id="al-gender" label="Sexo" value={gender} onChange={setGender}>
            <option value="">Todos</option>
            <option value="m">Mujeres</option>
            <option value="h">Hombres</option>
            <option value="sin">Sin definir</option>
          </Pick>
          <label className="check"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />Incluir dados de baja</label>
        </div>
        {isLoading && <Loading />}
        {error && !data && <ErrorBox error={error} retry={() => void refetch()} />}
        {data && rows.length === 0 && <Empty title="No hay alumnos con esos filtros" />}
        {rows.length > 0 && (
          <div className="tbl-wrap">
            <table className="table-compact">
              <thead><tr><th>Alumno</th><th>Curso</th><th>House</th><th>Sexo</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, shown).map((s) => (
                  <tr key={s.id} className={s.active ? "" : "row-off"}>
                    <td>{listName(s)}</td>
                    <td>
                      <select className="sel small" aria-label={`Curso de ${listName(s)}`} value={s.course} onChange={(e) => void patch(s, { course: e.target.value })}>
                        {COURSES.map((c) => <option key={c} value={c}>{courseLabel(c)}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="sel small" aria-label={`House de ${listName(s)}`} value={s.house} onChange={(e) => void patch(s, { house: e.target.value })}>
                        {HOUSES.map((h) => <option key={h} value={h}>{HOUSE_NAMES[h]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="sel small" aria-label={`Sexo de ${listName(s)}`} value={s.gender ?? ""} onChange={(e) => void patch(s, { gender: e.target.value || null })}>
                        <option value="">Sin definir</option>
                        <option value="m">{GENDER_ONE.m}</option>
                        <option value="h">{GENDER_ONE.h}</option>
                      </select>
                    </td>
                    <td className="row-actions">
                      {s.active ? (
                        <button className="btn small" type="button" onClick={() => setToRemove(s)}>Dar de baja</button>
                      ) : (
                        <button className="btn small" type="button" onClick={() => void patch(s, { active: true })}>Reactivar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown && <div className="pager"><button className="btn" type="button" onClick={() => setShown((n) => n + STEP)}>Ver más ({rows.length - shown})</button></div>}
      </div>
      <Confirm
        open={!!toRemove}
        title="¿Dar de baja a este alumno?"
        action="Dar de baja"
        danger
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove) void patch(toRemove, { active: false });
          setToRemove(null);
        }}
      >
        {toRemove && <p>{listName(toRemove)} deja de aparecer en las listas y los rankings. Sus marcas se conservan y se puede reactivar.</p>}
      </Confirm>
    </>
  );
}
