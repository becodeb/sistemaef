import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { SaveResult, Student, StudentContext } from "@shared/contracts";
import { fmtMark, hintFor, parseEntry, cleanRaw } from "@shared/domain/marks";
import { todayAR, courseLabel } from "@shared/domain/school";
import { fullName } from "@shared/domain/names";
import { Avatar, ErrorBox, Icon, Loading, StudentFacts } from "../../components/ui";
import { ddmm } from "../../lib/format";
import { refreshData, useApi, useDisciplines, useMe } from "../../lib/hooks";
import { sendMarks } from "../../lib/offline";
import { Verdict } from "./Verdict";
import type { Wizard } from "./NuevoRegistro";

export function CargaIndividual({ wiz, update }: { wiz: Wizard; update: (p: Partial<Wizard>, replace?: boolean) => void }) {
  const { byId } = useDisciplines();
  const d = byId(wiz.disciplineId);
  const students = useApi<Student[]>("/api/students");
  const context = useApi<StudentContext>(`/api/students/${wiz.student}/context?disciplineId=${wiz.disciplineId}`);
  const s = students.data?.find((x) => x.id === wiz.student);

  const [raw, setRaw] = useState("");
  const [absent, setAbsent] = useState(false);
  const [saved, setSaved] = useState<{ result: SaveResult; value: number | null; queued: boolean } | null>(null);
  const { data: me } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un envío por marca: si se reintenta el mismo, no se duplica.
  const batch = useRef<{ id: string; sig: string } | null>(null);

  if (students.error) return <ErrorBox error={students.error} retry={() => void students.refetch()} />;
  if (!s || !d) return <Loading />;

  const parsed = absent ? { ok: true, absent: true } : parseEntry(d, raw);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok || busy) return;
    const value = parsed.absent ? null : parsed.value!;
    const sig = `${value}|${wiz.date}`;
    if (batch.current?.sig !== sig) batch.current = { id: crypto.randomUUID(), sig };
    setBusy(true);
    setError(null);
    try {
      const body = { batchId: batch.current.id, disciplineId: d.id, takenOn: wiz.date, entries: [{ studentId: s.id, value }] };
      const { result, queued } = await sendMarks(me!.id, body, `${fullName(s)} · ${d.name}`);
      batch.current = null;
      setSaved({ result, value, queued });
      const what = `${fullName(s)} · ${value == null ? "ausente" : fmtMark(value, d)}`;
      if (queued) toast(`Sin conexión: ${what} quedó en el teléfono para enviarse`);
      else {
        toast.success(`Guardado: ${what}`);
        void refreshData();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    const isPb = saved.result.personalBests.length > 0;
    return (
      <div className="card saved">
        <div className="tick"><Icon name="check" size={26} /></div>
        <h2>{saved.queued ? "Guardada en este teléfono" : saved.value == null ? "Ausente registrado" : "Marca guardada"}</h2>
        <p className="sub">{fullName(s)} · {courseLabel(s.course)} · {d.name}</p>
        <div className="mk num">{saved.value == null ? "Ausente" : fmtMark(saved.value, d)}</div>
        {isPb && <span className="chip pb">Nueva marca personal</span>}
        <p className="sub">{saved.queued ? "No hay conexión: se envía sola cuando vuelva la señal, y ahí aparece en su perfil." : "Queda en su perfil, junto con todas sus marcas."}</p>
        <div className="actions center">
          <button className="btn" type="button" onClick={() => update({ student: null, step: 2 }, false)}>Otro alumno en {d.name}</button>
          <button className="btn pri" type="button" autoFocus onClick={() => { setSaved(null); setRaw(""); setAbsent(false); }}>Otra marca para {s.firstName}</button>
        </div>
        <div className="after-links">
          <Link className="link" to={`/estudiantes/${s.id}?d=${d.id}`}>Ver perfil de {s.firstName}</Link>
          <Link className="link" to="/registros">Ver últimos registros</Link>
        </div>
      </div>
    );
  }

  const ctx = context.data;
  return (
    <>
      <div className="card">
        <div className="ctx">
          <Avatar p={s} lg />
          <div className="grow">
            <div className="nm">{fullName(s)}</div>
            <StudentFacts s={s} label />
          </div>
          <span className="ctx-links">
            <Link className="link" to={`/estudiantes/${s.id}?d=${d.id}`}>Ver perfil</Link>
            <button className="link" type="button" onClick={() => update({ student: null, step: 2 }, false)}>Cambiar</button>
          </span>
        </div>
      </div>
      <div className="card">
        <div className="sport-head">
          <span className="ic"><Icon name={d.icon} /></span>
          <div><h2>{d.name}</h2><p className="sub">{d.better === "hi" ? `Mayor ${d.what.toLowerCase()} = mejor` : `Menor ${d.what.toLowerCase()} = mejor`}</p></div>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="measure">
            <label className="lbl" htmlFor="m-val">{d.what}</label>
            <div className="big-in">
              <div className={`unit-box${parsed.err ? " bad" : ""}`}>
                <input id="m-val" type="text" inputMode={d.kind === "ms" ? "numeric" : "decimal"} autoComplete="off" autoFocus placeholder={d.example} value={absent ? "" : raw} disabled={absent} aria-describedby="m-hint" onChange={(e) => setRaw(e.target.value)} onBlur={() => setRaw((r) => cleanRaw(d, r))} />
                <span>{d.unit}</span>
              </div>
            </div>
            <p className="hint" id="m-hint">{hintFor(d)}</p>
            <div className="verdict"><Verdict d={d} parsed={parsed} best={ctx?.best?.value} /></div>
          </div>
          <div className="refs">
            <div className="ref"><span>Su mejor marca</span><b className="num">{ctx?.best ? fmtMark(ctx.best.value, d) : "—"}</b>{ctx?.best && <small>{ddmm(ctx.best.takenOn)}</small>}</div>
            <div className="ref"><span>Mejor del curso ({courseLabel(s.course)})</span><b className="num">{ctx?.courseBest != null ? fmtMark(ctx.courseBest, d) : "—"}</b></div>
          </div>
          {ctx && ctx.marks.length > 0 && (
            <div className="mini-hist">
              <div className="mh-head"><span>Sus marcas en {d.name.toLowerCase()}</span><span>{ctx.total} cargadas</span></div>
              <ul>
                {ctx.marks.map((m) => (
                  <li key={m.id}>
                    <span className="num">{m.takenOn === todayAR() ? "Hoy" : ddmm(m.takenOn)}</span>
                    <b className="num">{m.value == null ? "Ausente" : fmtMark(m.value, d)}</b>
                    {ctx.best && m.value === ctx.best.value && <span className="tag">Mejor</span>}
                  </li>
                ))}
              </ul>
              {ctx.total > 4 && <Link className="link" to={`/estudiantes/${s.id}?d=${d.id}`}>Ver las {ctx.total} en su perfil</Link>}
            </div>
          )}
          <div className="row2">
            <div>
              <label className="lbl" htmlFor="m-date">Fecha</label>
              <input className="date-in" id="m-date" type="date" max={todayAR()} value={wiz.date} onChange={(e) => e.target.value && update({ date: e.target.value })} />
            </div>
            <label className="check"><input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />Estuvo ausente</label>
          </div>
          {error && <p className="form-err" role="alert">{error}</p>}
          <div className="actions sticky">
            <button className="btn" type="button" onClick={() => update({ step: 2 }, false)}>Volver</button>
            <button className="btn pri" type="submit" disabled={!parsed.ok || busy}>{busy ? "Guardando…" : "Guardar marca"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
