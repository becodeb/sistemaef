import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { JumpHistory, MarkRow, Profile, Student } from "@shared/contracts";
import { heightLines, type JumpResult } from "@shared/domain/heights";
import { fmtDiff, fmtMark, fmtSigned, fmtValue, isBetter, parseEntry, unitName, type DisciplineDef } from "@shared/domain/marks";
import { fullName } from "@shared/domain/names";
import { Avatar, Confirm, Empty, ErrorBox, Icon, Loading, StudentFacts } from "../components/ui";
import { LineChart } from "../components/LineChart";
import { api } from "../lib/api";
import { ddmm, ddmmyyyy, plural } from "../lib/format";
import { refreshData, useApi, useDisciplines, useMe } from "../lib/hooks";
import { isOfflineError, useOnline } from "../lib/offline";
import { isAdmin } from "@shared/domain/roles";
import { isGrad } from "@shared/domain/school";

function GoalCard({ studentId, d, best, first, goal, canEdit }: { studentId: string; d: DisciplineDef & { id: string }; best: number | null; first: number | null; goal: number | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async (target: number | null) => {
    try {
      await api.put(`/api/students/${studentId}/goals/${d.id}`, { target });
      setEditing(false);
      setErr(null);
      void refreshData();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = parseEntry(d, raw);
    if (p.value == null) return setErr(p.err ?? "Escribí la meta.");
    void save(p.value);
  };
  const reached = goal != null && best != null && (best === goal || isBetter(d, best, goal));
  const span = goal != null && first != null ? goal - first : 0;
  const pct = goal != null && best != null && first != null && span !== 0 ? Math.max(0, Math.min(100, ((best - first) / span) * 100)) : reached ? 100 : 0;

  return (
    <div className="card">
      <div className="card-top"><h2>Próxima meta</h2><span className="muted small">Acordada con el profe</span></div>
      {editing ? (
        <form className="goal-form" onSubmit={submit}>
          <div className="unit-box small-box">
            <input aria-label="Meta" autoFocus type="text" inputMode={d.kind === "ms" ? "numeric" : "decimal"} placeholder={d.example} value={raw} onChange={(e) => setRaw(e.target.value)} />
            <span>{d.unit}</span>
          </div>
          <button className="btn pri" type="submit">Guardar</button>
          <button className="btn" type="button" onClick={() => setEditing(false)}>Cancelar</button>
          {err && <p className="form-err">{err}</p>}
        </form>
      ) : goal == null ? (
        <>
          <p className="muted">Todavía no tiene una meta en {d.name.toLowerCase()}.</p>
          {canEdit && <button className="btn" type="button" onClick={() => { setRaw(""); setEditing(true); }}>Poner una meta</button>}
        </>
      ) : (
        <>
          <div className="goal-value num">{fmtMark(goal, d)}</div>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <p className="muted small">{reached ? "¡Llegó a la meta!" : best != null ? `Falta ${fmtDiff(goal - best, d)} para llegar a la meta.` : "Todavía no tiene marcas para comparar."}</p>
          {canEdit && (
            <div className="goal-actions">
              <button className="link" type="button" onClick={() => { setRaw(fmtValue(goal, d)); setEditing(true); }}>Cambiar</button>
              <button className="link" type="button" onClick={() => void save(null)}>Quitar</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TRY_MARK: Record<JumpResult, string> = { cleared: "✓", retry: "✗", out: "✗", absent: "A" };
const TRY_NAME: Record<JumpResult, string> = { cleared: "saltó", retry: "nulo", out: "nulo", absent: "ausente" };
const LINE_END: Record<JumpResult, [string, string]> = {
  cleared: ["Saltó", "s-ok"],
  retry: ["No terminó", "s-abs"],
  out: ["Nulo, no siguió", "s-out"],
  absent: ["Ausente", "s-abs"],
};

/** Salto en alto por alturas: cada clase con las alturas que intentó, los nulos y los intentos extra. */
function JumpClasses({ d, jumps }: { d: DisciplineDef; jumps: JumpHistory[] }) {
  return (
    <div className="card">
      <h2>Alturas por clase</h2>
      <p className="sub">✓ saltó · ✗ nulo · A ausente</p>
      {jumps.map((j) => {
        const lines = heightLines(j.attempts.map((a) => ({ ...a, studentId: "" })));
        const cleared = lines.filter((l) => l.result === "cleared");
        const best = cleared.length ? cleared[cleared.length - 1]!.height : null;
        const extra = j.attempts.filter((a) => a.result === "retry").length;
        const summary = best != null ? `Última altura superada: ${fmtMark(best, d)}` : lines.some((l) => l.result === "absent") ? "Ausente" : `No superó ${fmtMark(lines[0]!.height, d)}`;
        return (
          <div className="jump-class" key={j.batchId}>
            <div className="jc-top">
              <b className="num">{ddmmyyyy(j.takenOn)}</b>
              <span>{summary}{extra > 0 ? ` · ${plural(extra, "intento extra", "intentos extra")}` : ""}</span>
            </div>
            <ul className="jc-lines">
              {lines.map((l) => (
                <li key={l.round}>
                  <span className="num jc-h">{fmtMark(l.height, d)}</span>
                  <span className="jc-tries" aria-label={l.tries.map((t) => TRY_NAME[t]).join(", ")}>
                    {l.tries.map((t, i) => <i key={i} data-r={t}>{TRY_MARK[t]}</i>)}
                  </span>
                  <span className={`st-chip ${LINE_END[l.result][1]}`}>{LINE_END[l.result][0]}{l.result === "cleared" && l.tries.length > 1 ? ` (${l.tries.length}.º intento)` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function Perfil() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { list, byId } = useDisciplines();
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useApi<Profile>(`/api/students/${id}/profile`);
  const students = useApi<Student[]>("/api/students");
  const online = useOnline();
  const [toDelete, setToDelete] = useState<MarkRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Sin señal y sin este perfil guardado: se muestra el alumno con lo que hay en el dispositivo y se puede cargarle una marca.
  const known = students.data?.find((x) => x.id === id);
  if (!data && known && (!online || isOfflineError(error))) {
    return (
      <>
        <button className="link back" type="button" onClick={() => nav(-1)}><Icon name="back" size={15} />Volver</button>
        <div className="profile-head">
          <Avatar p={known} lg />
          <div className="grow">
            <h1>{fullName(known)}</h1>
            <StudentFacts s={known} label />
          </div>
          {!isGrad(known) && <Link className="btn pri with-icon" to={`/registros/nuevo?mode=one&step=3&student=${known.id}${list[0] ? `&d=${list[0].id}` : ""}`}><Icon name="plus" />Nueva marca</Link>}
        </div>
        <div className="card">
          <h2>Sin conexión</h2>
          <p className="sub">El historial de {known.firstName} todavía no está guardado en este dispositivo: se va a ver cuando vuelva la señal.{!isGrad(known) && " Igual podés cargarle una marca."}</p>
        </div>
      </>
    );
  }
  if (isLoading) return <Loading />;
  if (error && !data) return <ErrorBox error={error} retry={() => void refetch()} />;
  if (!data) return null;

  const s = data.student;
  const shown = data.disciplines.filter((x) => byId(x.disciplineId));
  const current = params.get("d") && byId(params.get("d")) ? params.get("d")! : list[0]?.id;
  const d = byId(current);
  const pd = shown.find((x) => x.disciplineId === current);
  if (!d || !pd) return <Loading />;

  const newestFirst = pd.marks;
  const chrono = [...newestFirst].reverse();
  const withValue = chrono.filter((m) => m.value != null);
  const best = withValue.reduce<MarkRow | null>((b, m) => (!b || isBetter(d, m.value!, b.value!) ? m : b), null);
  const first = withValue[0] ?? null;
  const gain = best && first ? (d.better === "hi" ? best.value! - first.value! : first.value! - best.value!) : 0;
  const prevOf = new Map<string, number>();
  withValue.forEach((m, i) => {
    if (i > 0) prevOf.set(m.id, m.value! - withValue[i - 1]!.value!);
  });

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.del(`/api/marks/${toDelete.id}`);
      toast.success("Marca borrada");
      setToDelete(null);
      void refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="link back" type="button" onClick={() => nav(-1)}><Icon name="back" size={15} />Volver</button>
      <div className="profile-head">
        <Avatar p={s} lg />
        <div className="grow">
          <h1>{fullName(s)}</h1>
          <StudentFacts s={s} label />
        </div>
        {!isGrad(s) && <Link className="btn pri with-icon" to={`/registros/nuevo?mode=one&step=3&student=${s.id}&d=${d.id}`}><Icon name="plus" />Nueva marca</Link>}
      </div>

      <div className="pills" role="group" aria-label="Disciplina">
        {shown.map((x) => (
          <button key={x.disciplineId} type="button" aria-pressed={x.disciplineId === current} onClick={() => setParams({ d: x.disciplineId }, { replace: true })}>
            {byId(x.disciplineId)!.name}
            <span className="n num">{x.marks.filter((m) => m.value != null).length}</span>
          </button>
        ))}
      </div>

      <div className="stats">
        <div className="card stat"><span>Mejor marca personal</span><b className="num acc">{best ? fmtMark(best.value!, d) : "—"}</b><small>{best ? `Lograda el ${ddmmyyyy(best.takenOn)}` : "Todavía sin marcas"}</small></div>
        <div className="card stat"><span>Progreso total</span><b className="num">{withValue.length > 1 ? (gain === 0 ? `0 ${d.kind === "ms" ? "s" : d.unit}` : `+${fmtDiff(gain, d)}`) : "—"}</b><small>{gain < 0 ? "" : "Desde la primera marca"}</small></div>
        <div className="card stat"><span>Marcas</span><b className="num">{withValue.length}</b><small>{first ? `Desde el ${ddmmyyyy(first.takenOn)}` : plural(0, "cargada", "cargadas")}</small></div>
      </div>

      <div className="grid wide-side">
        <div className="card">
          <div className="card-top">
            <div><h2>Evolución · {d.name}</h2><p className="sub">{unitName(d)[0]!.toUpperCase() + unitName(d).slice(1)} · {d.better === "hi" ? `mayor ${d.what.toLowerCase()} es mejor` : `menor ${d.what.toLowerCase()} es mejor`}</p></div>
            <span className="muted small">Hacia arriba = mejor resultado</span>
          </div>
          {withValue.length === 0 ? (
            <Empty title="Todavía no hay marcas en esta disciplina" />
          ) : (
            <LineChart title={`Evolución de ${fullName(s)} en ${d.name}`} invert={d.better === "lo"} fmt={(v) => fmtValue(v, d)} points={withValue.map((m) => ({ label: ddmm(m.takenOn), value: m.value! }))} />
          )}
        </div>
        <div className="stack">
          {d.heights && (pd.jumps?.length ?? 0) > 0 && <JumpClasses d={d} jumps={pd.jumps} />}
          <GoalCard key={`${s.id}${d.id}`} studentId={s.id} d={d} best={best?.value ?? null} first={first?.value ?? null} goal={pd.goal} canEdit={!!me && isAdmin(me.role) && !isGrad(s)} />
          <div className="card">
            <h2>Historial</h2>
            {newestFirst.length === 0 && <p className="muted">Sin marcas todavía.</p>}
            <ul className="history">
              {newestFirst.map((m) => {
                const diff = prevOf.get(m.id);
                return (
                  <li key={m.id}>
                    <span className="muted num" title={`Cargó ${m.createdByName}`}>{ddmmyyyy(m.takenOn)}</span>
                    <b className="num">{m.value == null ? "Ausente" : fmtMark(m.value, d)}</b>
                    <span className={`num diff${diff != null && isBetter(d, diff, 0) ? " up" : ""}`}>{diff != null && diff !== 0 ? fmtSigned(diff, d) : "—"}</span>
                    {m.canDelete ? <button className="del" type="button" aria-label={`Borrar la marca del ${ddmm(m.takenOn)}`} title="Borrar" onClick={() => setToDelete(m)}>×</button> : <span className="del-space" />}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      <Confirm open={!!toDelete} title="¿Borrar esta marca?" action="Borrar" danger busy={busy} onCancel={() => setToDelete(null)} onConfirm={() => void remove()}>
        {toDelete && <p>Se borra {toDelete.value == null ? "el ausente" : fmtMark(toDelete.value, d)} del {ddmmyyyy(toDelete.takenOn)} de {fullName(s)}, y se recalculan sus marcas personales. No se puede deshacer.</p>}
      </Confirm>
    </>
  );
}
