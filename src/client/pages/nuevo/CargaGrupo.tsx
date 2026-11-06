// Cargar a todo un curso o house: uno por uno en orden o en la planilla. Las dos formas usan el mismo borrador.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Discipline, RosterStudent, Roster, SaveResult } from "@shared/contracts";
import { cleanRaw, fmtMark, fmtSigned, hintFor, isBetter, parseEntry } from "@shared/domain/marks";
import { courseLabel, GENDER_NAMES, groupByKey, HOUSE_NAMES } from "@shared/domain/school";
import { fullName, listName, matchesName } from "@shared/domain/names";
import { Avatar, Empty, ErrorBox, HouseChip, Icon, Loading, StudentFacts } from "../../components/ui";
import { api, withQuery } from "../../lib/api";
import { loadDraft, removeDraft, saveDraft, type Draft } from "../../lib/drafts";
import { ddmm, plural } from "../../lib/format";
import { refreshData, useApi, useDisciplines, useMe } from "../../lib/hooks";
import { Verdict } from "./Verdict";
import type { Wizard } from "./NuevoRegistro";

const SHEET_HINT = "Enter o ↓ baja a la fila siguiente, ↑ sube. Escribí A si faltó.";

function tally(d: Discipline, list: RosterStudent[], vals: Draft["vals"]) {
  const t = { ok: 0, abs: 0, err: 0, pend: 0 };
  for (const s of list) {
    const p = parseEntry(d, vals[s.id]);
    if (p.err) t.err++;
    else if (p.empty) t.pend++;
    else if (p.absent) t.abs++;
    else t.ok++;
  }
  return t;
}
const stateOf = (d: Discipline, raw?: string) => {
  const p = parseEntry(d, raw);
  return p.err ? "err" : p.empty ? "pend" : p.absent ? "abs" : "ok";
};

function Status({ d, raw, best }: { d: Discipline; raw?: string; best?: number }) {
  const p = parseEntry(d, raw);
  if (p.err) return <span className="st-chip s-warn" title={p.err}>Revisar</span>;
  if (p.empty) return <span className="st-chip s-pend">Pendiente</span>;
  if (p.absent) return <span className="st-chip s-abs">Ausente</span>;
  if (best != null && isBetter(d, p.value!, best)) return <span className="st-chip s-pb">Nueva marca {fmtSigned(p.value! - best, d)}</span>;
  return <span className="st-chip s-ok">Cargado</span>;
}

type Saved = { result: SaveResult; pending: number; names: Map<string, string> };

export function CargaGrupo({ wiz, update }: { wiz: Wizard; update: (p: Partial<Wizard>, replace?: boolean) => void }) {
  const { byId } = useDisciplines();
  const { data: me } = useMe();
  const d = byId(wiz.disciplineId);
  const group = groupByKey(wiz.group)!;
  const ref = useMemo(() => ({ group: wiz.group!, gender: wiz.gender, disciplineId: wiz.disciplineId! }), [wiz.group, wiz.gender, wiz.disciplineId]);
  const userId = me!.id;
  const roster = useApi<Roster>(withQuery("/api/roster", { group: wiz.group, gender: wiz.gender, disciplineId: wiz.disciplineId }));

  const [draft, setDraft] = useState<Draft>(() => loadDraft(userId, ref) ?? { vals: {}, idx: 0, date: wiz.date });
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Retoma la fecha con la que se empezó esta planilla.
  useEffect(() => {
    if (draft.date !== wiz.date && Object.keys(draft.vals).length > 0) update({ date: draft.date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (saved) return;
    if (Object.keys(draft.vals).length > 0 || draft.onlyIds) saveDraft(userId, ref, { ...draft, date: wiz.date });
    else removeDraft(userId, ref);
  }, [draft, saved, userId, ref, wiz.date]);

  const list = useMemo(() => {
    const all = roster.data?.students ?? [];
    return draft.onlyIds ? all.filter((s) => draft.onlyIds!.includes(s.id)) : all;
  }, [roster.data, draft.onlyIds]);

  if (roster.error) return <ErrorBox error={roster.error} retry={() => void roster.refetch()} />;
  if (!d || !roster.data) return <Loading />;

  const groupTitle = `${group.name}${wiz.gender ? ` · ${GENDER_NAMES[wiz.gender]}` : ""}`;

  if (saved) {
    const r = saved.result;
    const other = `Otra disciplina con ${group.short}`;
    return (
      <div className="card saved">
        <div className="tick"><Icon name="check" size={26} /></div>
        <h2>Planilla guardada</h2>
        <p className="sub">{groupTitle} · {d.name} · {ddmm(wiz.date)}. Cada marca quedó en el perfil de su alumno.</p>
        <div className="g-sum">
          <div><b className="num">{r.saved}</b><span>{r.saved === 1 ? "marca guardada" : "marcas guardadas"}</span></div>
          <div><b className="num">{r.absent}</b><span>{r.absent === 1 ? "ausente" : "ausentes"}</span></div>
          <div><b className="num">{saved.pending}</b><span>sin cargar</span></div>
        </div>
        {r.personalBests.length > 0 && (
          <div className="pb-list">
            <h3>Nuevas marcas personales</h3>
            {r.personalBests.map((p) => (
              <Link key={p.studentId} className="pb-row" to={`/estudiantes/${p.studentId}?d=${d.id}`}>
                <span>{saved.names.get(p.studentId)}</span>
                <b className="num">{fmtMark(p.value, d)}</b>
              </Link>
            ))}
          </div>
        )}
        <div className="actions center">
          {saved.pending > 0 ? (
            <>
              <button className="btn" type="button" onClick={() => update({ disciplineId: null, step: 2 }, false)}>{other}</button>
              <button className="btn pri" type="button" autoFocus onClick={() => setSaved(null)}>Seguir con {saved.pending === 1 ? "el que falta" : `los ${saved.pending} que faltan`}</button>
            </>
          ) : (
            <button className="btn pri" type="button" autoFocus onClick={() => update({ disciplineId: null, step: 2 }, false)}>{other}</button>
          )}
        </div>
        <div className="after-links"><Link className="link" to="/registros">Ver últimos registros</Link></div>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="card">
        <Empty title={`No hay alumnos en ${groupTitle.toLowerCase()}`}>Un administrador los carga desde Administración → Alumnos.</Empty>
        <div className="actions"><button className="btn" type="button" onClick={() => update({ step: 2 }, false)}>Volver</button></div>
      </div>
    );
  }

  const t = tally(d, list, draft.vals);
  const canSave = t.err === 0 && t.ok + t.abs > 0 && !saving;
  const label = saving ? "Guardando…" : `Guardar ${t.ok + t.abs} de ${list.length}`;

  const save = async () => {
    if (!canSave) return;
    const entries = list.flatMap((s) => {
      const p = parseEntry(d, draft.vals[s.id]);
      return p.ok ? [{ studentId: s.id, value: p.absent ? null : p.value! }] : [];
    });
    const sig = JSON.stringify([wiz.date, entries]);
    const batchId = draft.batchSig === sig && draft.batchId ? draft.batchId : crypto.randomUUID();
    const withBatch = { ...draft, batchId, batchSig: sig };
    setDraft(withBatch);
    saveDraft(userId, ref, { ...withBatch, date: wiz.date });
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.post<SaveResult>("/api/marks", { batchId, disciplineId: d.id, takenOn: wiz.date, entries });
      const done = new Set(entries.map((e) => e.studentId));
      const pendingIds = list.filter((s) => !done.has(s.id)).map((s) => s.id);
      if (pendingIds.length) {
        const next: Draft = { vals: {}, idx: 0, date: wiz.date, onlyIds: pendingIds };
        saveDraft(userId, ref, next);
        setDraft(next);
      } else {
        removeDraft(userId, ref);
        setDraft({ vals: {}, idx: 0, date: wiz.date });
      }
      setSaved({ result, pending: pendingIds.length, names: new Map(list.map((s) => [s.id, fullName(s)])) });
      window.scrollTo(0, 0);
      toast.success(`Guardado: ${plural(result.saved, "marca", "marcas")} en los perfiles`);
      void refreshData();
    } catch (err) {
      // Lo anotado sigue en el borrador: se puede reintentar sin perder nada.
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const setVal = (id: string, raw: string) => setDraft((dr) => ({ ...dr, vals: { ...dr.vals, [id]: raw } }));

  return (
    <div className={`grid${wiz.way === "sheet" ? " solo" : ""}`}>
      <section className="stack">
        <div className={`card ghead view-${wiz.way}`}>
          <div className="gh-top">
            <div className="sport-head">
              <span className="ic"><Icon name={d.icon} /></span>
              <div>
                <h2>{groupTitle} · {d.name}</h2>
                <p className="sub">{d.what} · {ddmm(wiz.date)}</p>
              </div>
            </div>
            <div className="seg" role="group" aria-label="Forma de carga">
              <button type="button" aria-pressed={wiz.way === "seq"} onClick={() => update({ way: "seq" })}><Icon name="list" />Uno por uno</button>
              <button type="button" aria-pressed={wiz.way === "sheet"} onClick={() => update({ way: "sheet" })}><Icon name="sheet" />Planilla</button>
            </div>
          </div>
          <div className="gh-bottom">
            <div className="prog">
              <span className="num">{plural(t.ok, "marca", "marcas")} · {plural(t.abs, "ausente", "ausentes")} · {t.pend} sin cargar{t.err ? ` · ${t.err} para revisar` : ""}</span>
              <div className="bar"><i style={{ width: `${((t.ok + t.abs) / list.length) * 100}%` }} /></div>
            </div>
            <button className="btn" type="button" onClick={() => update({ step: 2 }, false)}>Volver</button>
            <button className="btn pri g-save" type="button" disabled={!canSave} onClick={save}>{label}</button>
          </div>
          {saveError && <p className="form-err" role="alert">{saveError} Lo anotado sigue acá: probá guardar de nuevo.</p>}
        </div>
        {wiz.way === "seq" ? (
          <UnoPorUno d={d} list={list} draft={draft} setDraft={setDraft} setVal={setVal} courseBest={roster.data.courseBest} canSave={canSave} label={label} onSave={save} onSheet={() => update({ way: "sheet" })} />
        ) : (
          <Planilla d={d} list={list} vals={draft.vals} setVal={setVal} isHouse={group.type === "house"} canSave={canSave} label={label} onSave={save} />
        )}
      </section>
      {wiz.way === "seq" && (
        <aside className="aside card" aria-label="Lista">
          <h3>Lista · {group.short}{wiz.gender ? ` · ${GENDER_NAMES[wiz.gender]}` : ""}</h3>
          <Roster2 d={d} list={list} draft={draft} setDraft={setDraft} />
        </aside>
      )}
    </div>
  );
}

function nextPending(d: Discipline, list: RosterStudent[], vals: Draft["vals"], from: number) {
  for (let k = 1; k < list.length; k++) {
    const i = (from + k) % list.length;
    if (!parseEntry(d, vals[list[i]!.id]).ok) return i;
  }
  return -1;
}

function Roster2({ d, list, draft, setDraft }: { d: Discipline; list: RosterStudent[]; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = box.current;
    const cur = el?.querySelector<HTMLElement>(".cur");
    if (el && cur) el.scrollTop = cur.parentElement!.offsetTop - el.offsetTop - el.clientHeight / 2;
  }, [draft.idx]);
  return (
    <ol className="roster" ref={box}>
      {list.map((s, i) => {
        const raw = draft.vals[s.id];
        const p = parseEntry(d, raw);
        return (
          <li key={s.id}>
            <button type="button" className={i === draft.idx ? "cur" : ""} data-state={stateOf(d, raw)} onClick={() => setDraft((dr) => ({ ...dr, idx: i }))}>
              <span className="n num">{i + 1}</span>
              <span className="nm">{listName(s)}</span>
              <span className="val num">{p.err ? "Revisar" : p.empty ? "—" : p.absent ? "Ausente" : fmtMark(p.value!, d)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function UnoPorUno({ d, list, draft, setDraft, setVal, courseBest, canSave, label, onSave, onSheet }: {
  d: Discipline;
  list: RosterStudent[];
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  setVal: (id: string, raw: string) => void;
  courseBest: Record<string, number>;
  canSave: boolean;
  label: string;
  onSave: () => void;
  onSheet: () => void;
}) {
  const idx = Math.min(draft.idx, list.length - 1);
  const s = list[idx]!;
  const raw = draft.vals[s.id] ?? "";
  const parsed = parseEntry(d, raw);
  const input = useRef<HTMLInputElement>(null);
  const allDone = list.every((x) => parseEntry(d, draft.vals[x.id]).ok);
  const [finished, setFinished] = useState(allDone);

  // Al entrar, se para en el primero que falta.
  useEffect(() => {
    if (parsed.ok) {
      const n = nextPending(d, list, draft.vals, idx);
      if (n >= 0) setDraft((dr) => ({ ...dr, idx: n }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!finished) {
      input.current?.focus();
      input.current?.select();
    }
  }, [idx, finished]);

  const advance = (vals: Draft["vals"]) => {
    const n = nextPending(d, list, vals, idx);
    if (n < 0) setFinished(true);
    else setDraft((dr) => ({ ...dr, idx: n }));
  };

  if (finished && allDone) {
    const ok = list.filter((x) => parseEntry(d, draft.vals[x.id]).value != null).length;
    return (
      <div className="card saved">
        <div className="tick"><Icon name="check" size={26} /></div>
        <h2>Ya pasaste por toda la lista</h2>
        <p className="sub">{plural(ok, "marca lista", "marcas listas")} y {plural(list.length - ok, "ausente", "ausentes")} para guardar. Hasta que guardes, podés corregir cualquiera.</p>
        <div className="actions center">
          <button className="btn" type="button" onClick={onSheet}>Revisar en la planilla</button>
          <button className="btn pri" type="button" autoFocus disabled={!canSave} onClick={onSave}>{label}</button>
        </div>
      </div>
    );
  }

  const next = nextPending(d, list, draft.vals, idx);
  return (
    <div className="card">
      <div className="seq-pos num">Alumno <b>{idx + 1}</b> de {list.length}<span>Orden de lista</span></div>
      <div className="ctx">
        <Avatar p={s} lg />
        <div className="grow">
          <div className="nm big">{fullName(s)}</div>
          <StudentFacts s={s} />
        </div>
        <span className="ctx-links"><Link className="link" to={`/estudiantes/${s.id}?d=${d.id}`}>Ver perfil</Link></span>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.ok) return;
          const clean = cleanRaw(d, raw);
          setVal(s.id, clean);
          advance({ ...draft.vals, [s.id]: clean });
        }}
      >
        <div className="measure">
          <label className="lbl" htmlFor="seq-val">{d.what}</label>
          <div className="big-in">
            <div className={`unit-box${parsed.err ? " bad" : ""}`}>
              <input ref={input} id="seq-val" type="text" inputMode={d.kind === "ms" ? "numeric" : "decimal"} autoComplete="off" placeholder={d.example} value={raw} aria-describedby="m-hint" onChange={(e) => setVal(s.id, e.target.value)} />
              <span>{d.unit}</span>
            </div>
          </div>
          <p className="hint" id="m-hint">{hintFor(d)}</p>
          <div className="verdict"><Verdict d={d} parsed={parsed} best={s.best?.value} /></div>
        </div>
        <div className="refs">
          <div className="ref"><span>Su mejor marca</span><b className="num">{s.best ? fmtMark(s.best.value, d) : "—"}</b>{s.best && <small>{ddmm(s.best.takenOn)}</small>}</div>
          <div className="ref"><span>Mejor del curso ({courseLabel(s.course)})</span><b className="num">{courseBest[s.course] != null ? fmtMark(courseBest[s.course]!, d) : "—"}</b></div>
        </div>
        <p className="seq-next">{next < 0 ? "Es el último que falta." : `Sigue: ${fullName(list[next]!)}`}</p>
        <div className="actions sticky seq-actions">
          <button className="btn" type="button" disabled={idx === 0} onClick={() => setDraft((dr) => ({ ...dr, idx: idx - 1 }))}>Anterior</button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (next < 0) toast("Es el único que falta.");
              else setDraft((dr) => ({ ...dr, idx: next }));
            }}
          >
            Saltear
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setVal(s.id, "A");
              advance({ ...draft.vals, [s.id]: "A" });
            }}
          >
            Ausente
          </button>
          <button className="btn pri seq-ok" type="submit" disabled={!parsed.ok}>Anotar y seguir</button>
        </div>
      </form>
    </div>
  );
}

function Planilla({ d, list, vals, setVal, isHouse, canSave, label, onSave }: {
  d: Discipline;
  list: RosterStudent[];
  vals: Draft["vals"];
  setVal: (id: string, raw: string) => void;
  isHouse: boolean;
  canSave: boolean;
  label: string;
  onSave: () => void;
}) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const visible = q.trim() ? list.filter((s) => matchesName(s, q)) : list;
  const firstPending = list.find((s) => !parseEntry(d, vals[s.id]).ok)?.id;

  useEffect(() => {
    if (firstPending) document.getElementById(`cell-${firstPending}`)?.focus();
    else search.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (from: HTMLElement, dir: number) => {
    const cells = [...(body.current?.querySelectorAll<HTMLInputElement>(".cell") ?? [])];
    cells[cells.indexOf(from as HTMLInputElement) + dir]?.focus();
  };
  const showMsg = (raw: string | undefined) => setMsg(parseEntry(d, raw).err ?? null);

  return (
    <div className="card sheet-card">
      <div className="sheet-tools">
        <div className="search">
          <Icon name="search" />
          <input
            ref={search}
            id="sheet-q"
            type="text"
            autoComplete="off"
            placeholder="Buscá al alumno en la planilla"
            aria-label="Buscar alumno en la planilla"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                body.current?.querySelector<HTMLInputElement>(".cell")?.focus();
              } else if (e.key === "Escape") setQ("");
            }}
          />
        </div>
        <p className={`hint${msg ? " is-err" : ""}`} role="status">{msg ?? SHEET_HINT}</p>
      </div>
      <div className="sheet-scroll">
        <table className="sheet">
          <thead>
            <tr>
              <th className="c-n">N.º</th>
              <th className="c-name">Alumno</th>
              {isHouse && <th className="c-course">Curso</th>}
              {!isHouse && <th className="c-house">House</th>}
              <th className="c-best">Mejor marca</th>
              <th className="c-cell">{d.what} ({d.kind === "ms" ? "min:s" : d.unit})</th>
              <th className="c-status">Estado</th>
              <th className="c-abs" title="Ausente">Aus.</th>
            </tr>
          </thead>
          <tbody ref={body}>
            {visible.map((s) => {
              const raw = vals[s.id] ?? "";
              const best = s.best ? fmtMark(s.best.value, d) : "—";
              const absent = !!parseEntry(d, raw).absent;
              return (
                <tr key={s.id} data-state={stateOf(d, raw)}>
                  <td className="c-n num">{list.indexOf(s) + 1}</td>
                  <td className="c-name">
                    <Link className="name-btn" tabIndex={-1} to={`/estudiantes/${s.id}?d=${d.id}`}>{listName(s)}</Link>
                    <small className="inline-st num">{s.best && `Mejor ${best} · `}<Status d={d} raw={raw} best={s.best?.value} /></small>
                  </td>
                  {isHouse && <td className="c-course num">{courseLabel(s.course)}</td>}
                  {!isHouse && <td className="c-house"><HouseChip house={s.house} /></td>}
                  <td className="c-best num">{best}</td>
                  <td className="c-cell">
                    <input
                      className="cell"
                      id={`cell-${s.id}`}
                      type="text"
                      inputMode={d.kind === "ms" ? "numeric" : "decimal"}
                      autoComplete="off"
                      placeholder={d.kind === "ms" ? "0:00" : ""}
                      aria-label={`${d.what} de ${fullName(s)}`}
                      value={raw}
                      onChange={(e) => {
                        setVal(s.id, e.target.value);
                        showMsg(e.target.value);
                      }}
                      onFocus={(e) => {
                        e.target.select();
                        showMsg(raw);
                      }}
                      onBlur={(e) => {
                        const clean = cleanRaw(d, e.target.value);
                        if (clean !== e.target.value) setVal(s.id, clean);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          // Si vino del buscador, vuelve al buscador para encontrar al siguiente.
                          if (q.trim()) {
                            const clean = cleanRaw(d, e.currentTarget.value);
                            if (clean !== e.currentTarget.value) setVal(s.id, clean);
                            setQ("");
                            search.current?.focus();
                          } else move(e.currentTarget, 1);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          move(e.currentTarget, 1);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          move(e.currentTarget, -1);
                        }
                      }}
                    />
                  </td>
                  <td className="c-status"><Status d={d} raw={raw} best={s.best?.value} /></td>
                  <td className="c-abs">
                    <button className="abs" type="button" tabIndex={-1} aria-pressed={absent} aria-label={`Marcar a ${fullName(s)} como ausente`} title="Ausente" onClick={() => setVal(s.id, absent ? "" : "A")}>A</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="sheet-none">No hay nadie con ese nombre en esta planilla.</p>}
      <div className="actions sticky">
        <button className="btn pri" type="button" disabled={!canSave} onClick={onSave}>{label}</button>
      </div>
    </div>
  );
}
