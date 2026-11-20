// Salto en alto por rondas de alturas. El profe fija la altura, pasa a cada alumno con Saltó, Nulo o Ausente y, cuando
// no queda nadie, sube la varilla: a la altura nueva pasan solos los que la superaron. Cada toque queda en el
// dispositivo; la clase entera se envía al servidor cada vez que se cambia de altura y al terminar.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Discipline, RosterStudent, SaveResult } from "@shared/contracts";
import { advancing, currentHeight, currentRound, lastResults, marksFrom, nextHeightError, nextRound, nextSeq, queueOf, record, startSession, undo, type JumpResult, type JumpSession } from "@shared/domain/heights";
import { cleanRaw, fmtMark, fmtValue, parseEntry } from "@shared/domain/marks";
import { GENDER_NAMES, groupByKey } from "@shared/domain/school";
import { fullName, listName } from "@shared/domain/names";
import { Avatar, Confirm, Empty, ErrorBox, Icon, Loading, StudentFacts } from "../../components/ui";
import { loadJump, removeJump, saveJump, type JumpDraft } from "../../lib/jumps";
import { sendMarks } from "../../lib/offline";
import { ddmm, plural } from "../../lib/format";
import { refreshData, useMe } from "../../lib/hooks";
import { useGroupRoster } from "./CargaGrupo";
import type { Wizard } from "./NuevoRegistro";

const STEP = 0.05;
const RESULT_LABEL: Record<JumpResult, string> = { cleared: "Saltó", retry: "Nulo · otro intento", out: "Nulo · no sigue", absent: "Ausente" };
const RESULT_CHIP: Record<JumpResult, string> = { cleared: "s-ok", retry: "s-warn", out: "s-out", absent: "s-abs" };

type Finished = { result: SaveResult; queued: boolean; session: JumpSession };

export function Alturas({ wiz, update, d }: { wiz: Wizard; update: (p: Partial<Wizard>, replace?: boolean) => void; d: Discipline }) {
  const { data: me } = useMe();
  const userId = me!.id;
  const group = groupByKey(wiz.group)!;
  const ref = useMemo(() => ({ group: wiz.group!, gender: wiz.gender, disciplineId: d.id }), [wiz.group, wiz.gender, d.id]);
  const { roster, offlineList } = useGroupRoster(wiz);
  const [draft, setDraft] = useState<JumpDraft | null>(() => loadJump(userId, ref));
  const [finished, setFinished] = useState<Finished | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Alguien que el profe hace saltar antes, tocándolo en la fila. */
  const [picked, setPicked] = useState<string | null>(null);

  // Retoma la fecha con la que se empezó esta clase.
  useEffect(() => {
    if (draft && draft.date !== wiz.date) update({ date: draft.date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupTitle = `${group.name}${wiz.gender ? ` · ${GENDER_NAMES[wiz.gender]}` : ""}`;
  const label = `${groupTitle} · ${d.name}`;

  if (roster.error && !roster.data && !draft) return <ErrorBox error={roster.error} retry={() => void roster.refetch()} />;
  if (!roster.data && !draft) return <Loading />;

  const list = roster.data?.students ?? [];
  const byId = new Map(list.map((s) => [s.id, s]));

  const commit = (session: JumpSession) => {
    const next = { batchId: draft?.batchId ?? crypto.randomUUID(), date: draft?.date ?? wiz.date, session };
    saveJump(userId, ref, next);
    setDraft(next);
  };

  /** Envía la clase entera. Sin señal queda en el teléfono y sale sola después. */
  const send = async (session: JumpSession) => sendMarks(userId, { batchId: draft!.batchId, disciplineId: d.id, takenOn: draft!.date, entries: [], attempts: session.attempts }, label);

  const newHeight = (height: number) => {
    const session = draft!.session;
    commit(nextRound(session, height));
    window.scrollTo(0, 0);
    // Lo de la altura anterior se guarda mientras se sigue saltando.
    send(session)
      .then(({ queued }) => {
        if (!queued) void refreshData();
      })
      .catch((err: Error) => toast.error(`No se pudo guardar: ${err.message}`));
  };

  const finish = async () => {
    const session = draft!.session;
    if (session.attempts.length === 0) {
      removeJump(userId, ref);
      setDraft(null);
      update({ step: 2 }, false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { result, queued } = await send(session);
      removeJump(userId, ref);
      setFinished({ result, queued, session });
      window.scrollTo(0, 0);
      if (queued) toast("Sin conexión: la clase quedó en el teléfono y se envía sola cuando vuelva la señal");
      else {
        toast.success("Salto en alto guardado en los perfiles");
        void refreshData();
      }
    } catch (err) {
      // La clase sigue guardada en el dispositivo: se puede reintentar.
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string) => {
    const s = byId.get(id);
    return s ? fullName(s) : "Alumno que ya no está en la lista";
  };
  const head = (
    <div className="card ghead">
      <div className="gh-top">
        <div className="sport-head">
          <span className="ic"><Icon name={d.icon} /></span>
          <div>
            <h2>{groupTitle} · {d.name}</h2>
            <p className="sub">Por alturas · {ddmm(draft?.date ?? wiz.date)}</p>
          </div>
        </div>
      </div>
      {offlineList && <p className="hint">Sin conexión: la lista sale de lo guardado en este dispositivo y no muestra las mejores marcas.</p>}
      {error && <p className="form-err" role="alert">{error} La clase sigue guardada acá: probá de nuevo.</p>}
    </div>
  );

  if (finished) return <Final d={d} f={finished} nameOf={nameOf} groupShort={group.short} update={update} />;

  if (!draft) {
    if (list.length === 0) {
      return (
        <div className="card">
          <Empty title={`No hay alumnos en ${groupTitle.toLowerCase()}`}>Un administrador los carga desde Administración → Alumnos.</Empty>
          <div className="actions"><button className="btn" type="button" onClick={() => update({ step: 2 }, false)}>Volver</button></div>
        </div>
      );
    }
    return (
      <div className="stack">
        {head}
        <Inicio d={d} list={list} onStart={(h) => commit(startSession(h, list.map((s) => s.id)))} onBack={() => update({ step: 2 }, false)} />
      </div>
    );
  }

  const session = draft.session;
  const queue = queueOf(session);
  if (queue.length === 0) {
    return (
      <div className="stack">
        {head}
        <FinDeAltura d={d} session={session} nameOf={nameOf} busy={busy} onUndo={() => commit(undo(session))} onFinish={() => void finish()} onNext={newHeight} />
      </div>
    );
  }
  return (
    <div className="grid">
      <section className="stack">
        {head}
        <Ronda d={d} session={session} queue={queue} byId={byId} nameOf={nameOf} busy={busy} commit={commit} onFinish={() => void finish()} picked={picked} setPicked={setPicked} />
      </section>
      <aside className="aside card jump-side" aria-label="Lista de la altura">
        <Fila d={d} session={session} queue={queue} nameOf={nameOf} current={picked && queue.includes(picked) ? picked : queue[0]!} onPick={setPicked} />
      </aside>
    </div>
  );
}

function HeightInput({ d, raw, setRaw, id, err }: { d: Discipline; raw: string; setRaw: (v: string) => void; id: string; err?: string | null }) {
  return (
    <div className="big-in">
      <div className={`unit-box${err ? " bad" : ""}`}>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" placeholder={d.example} value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={(e) => setRaw(cleanRaw(d, e.target.value))} />
        <span>{d.unit}</span>
      </div>
    </div>
  );
}

/** Antes de empezar: la altura inicial. Todos los de la lista arrancan ahí. */
function Inicio({ d, list, onStart, onBack }: { d: Discipline; list: RosterStudent[]; onStart: (h: number) => void; onBack: () => void }) {
  const [raw, setRaw] = useState("");
  const p = parseEntry(d, raw);
  const err = p.absent ? "Escribí la altura de la varilla." : p.err;
  return (
    <div className="card">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (p.value != null) onStart(p.value);
        }}
      >
        <div className="measure">
          <label className="lbl" htmlFor="h-start">Altura inicial</label>
          <HeightInput d={d} raw={raw} setRaw={setRaw} id="h-start" err={err} />
          <p className={`hint${err ? " is-err" : ""}`}>{err ?? "Todos empiezan intentando esta altura. Cuando terminen, la subís y siguen solo los que la saltaron."}</p>
        </div>
        <h3 className="jump-title">Empiezan {plural(list.length, "alumno", "alumnos")}</h3>
        <ol className="jump-names">
          {list.map((s) => <li key={s.id}>{listName(s)}</li>)}
        </ol>
        <div className="actions sticky">
          <button className="btn" type="button" onClick={onBack}>Volver</button>
          <button className="btn pri" type="submit" disabled={p.value == null}>{p.value != null ? `Empezar en ${fmtMark(p.value, d)}` : "Empezar"}</button>
        </div>
      </form>
    </div>
  );
}

/** Lo mejor que saltó cada uno en esta clase. */
function bestIn(session: JumpSession) {
  return new Map(marksFrom(session.attempts).map((m) => [m.studentId, m.value]));
}

function Ronda({ d, session, queue, byId, nameOf, busy, commit, onFinish, picked, setPicked }: {
  d: Discipline;
  session: JumpSession;
  queue: string[];
  byId: Map<string, RosterStudent>;
  nameOf: (id: string) => string;
  busy: boolean;
  commit: (s: JumpSession) => void;
  onFinish: () => void;
  picked: string | null;
  setPicked: (id: string | null) => void;
}) {
  const [nulo, setNulo] = useState(false);
  const [ending, setEnding] = useState(false);
  const id = picked && queue.includes(picked) ? picked : queue[0]!;
  const s = byId.get(id);
  const seq = nextSeq(session, id);
  const height = currentHeight(session);
  const round = currentRound(session);
  const total = session.rounds[round - 1]!.order.length;
  const doneCount = total - queue.length;
  const today = bestIn(session).get(id);
  const nextId = queue.find((x) => x !== id);
  const lastInRound = session.attempts[session.attempts.length - 1]?.round === round;

  useEffect(() => setNulo(false), [id, seq]);

  const mark = (result: JumpResult) => {
    commit(record(session, id, result));
    setPicked(null);
    setNulo(false);
  };

  return (
    <div className="card">
      <div className="jump-head">
        <div>
          <span className="lbl">Altura {round > 1 ? `${round}` : "inicial"}</span>
          <b className="jump-h num">{fmtMark(height, d)}</b>
        </div>
        <div className="prog">
          <span className="num">{doneCount} de {total} terminaron · {plural(queue.length, "falta", "faltan")}</span>
          <div className="bar"><i style={{ width: `${(doneCount / total) * 100}%` }} /></div>
        </div>
      </div>

      <div className="seq-pos num">Le toca{seq > 1 && <em className="try-pill">{seq}.º intento</em>}</div>
      <div className="ctx">
        {s ? <Avatar p={s} lg /> : <span className="av lg">?</span>}
        <div className="grow">
          <div className="nm big">{nameOf(id)}</div>
          {s && <StudentFacts s={s} />}
        </div>
      </div>
      <div className="refs">
        <div className="ref"><span>Su mejor marca</span><b className="num">{s?.best ? fmtMark(s.best.value, d) : "—"}</b>{s?.best && <small>{ddmm(s.best.takenOn)}</small>}</div>
        <div className="ref"><span>Hoy ya saltó</span><b className="num">{today != null ? fmtMark(today, d) : "—"}</b></div>
      </div>

      {nulo ? (
        <div className="nulo-box" role="group" aria-label="Después del nulo">
          <p><b>Nulo en {fmtMark(height, d)}.</b> ¿Vuelve a intentar esta altura?</p>
          <div className="jump-btns two">
            <button className="jb retry" type="button" autoFocus onClick={() => mark("retry")}>
              <b>Otro intento</b><span>Pasa al final de la fila</span>
            </button>
            <button className="jb out" type="button" onClick={() => mark("out")}>
              <b>No vuelve a intentar</b><span>Queda afuera de las alturas que siguen</span>
            </button>
          </div>
          <button className="link" type="button" onClick={() => setNulo(false)}>Cancelar</button>
        </div>
      ) : (
        <div className="jump-btns" role="group" aria-label={`Resultado de ${nameOf(id)}`}>
          <button className="jb ok" type="button" onClick={() => mark("cleared")}><Icon name="check" size={28} /><b>Saltó</b></button>
          <button className="jb nulo" type="button" onClick={() => setNulo(true)}><span className="x" aria-hidden="true">✕</span><b>Nulo</b></button>
          <button className="jb aus" type="button" onClick={() => mark("absent")}><span className="x" aria-hidden="true">A</span><b>Ausente</b></button>
        </div>
      )}

      <p className="seq-next">{nextId ? `Sigue: ${nameOf(nextId)}` : "Es el último que falta en esta altura."}</p>
      <div className="actions jump-foot">
        <button className="btn" type="button" disabled={!lastInRound} onClick={() => commit(undo(session))}>Deshacer el último</button>
        <button className="btn" type="button" disabled={busy} onClick={() => setEnding(true)}>Terminar la clase acá</button>
      </div>
      <Confirm open={ending} title="¿Terminar la clase ahora?" action="Terminar y guardar" busy={busy} onCancel={() => setEnding(false)} onConfirm={() => { setEnding(false); onFinish(); }}>
        <p>{plural(queue.length, "alumno no terminó", "alumnos no terminaron")} {fmtMark(height, d)}: les queda como marca la última altura que superaron. Se guarda todo lo anotado.</p>
      </Confirm>
    </div>
  );
}

/** La fila de la altura actual: primero los que faltan (en orden), después cómo terminó cada uno. */
function Fila({ d, session, queue, nameOf, current, onPick }: { d: Discipline; session: JumpSession; queue: string[]; nameOf: (id: string) => string; current: string; onPick: (id: string) => void }) {
  const last = lastResults(session);
  const done = session.rounds[session.rounds.length - 1]!.order.filter((id) => !queue.includes(id));
  const out = session.rounds.length > 1 ? session.rounds[0]!.order.length - session.rounds[session.rounds.length - 1]!.order.length : 0;
  return (
    <>
      <h3>En {fmtMark(currentHeight(session), d)}</h3>
      <p className="small muted">Tocá un nombre para que salte antes.</p>
      <ol className="roster">
        {queue.map((id, i) => (
          <li key={id}>
            <button type="button" className={id === current ? "cur" : ""} aria-current={id === current ? "true" : undefined} onClick={() => { onPick(id); window.scrollTo(0, 0); }}>
              <span className="n num">{i + 1}</span>
              <span className="nm">{nameOf(id)}</span>
              <span className="val">{last.get(id) ? `${last.get(id)!.seq + 1}.º intento` : ""}</span>
            </button>
          </li>
        ))}
      </ol>
      {done.length > 0 && (
        <>
          <h3 className="jump-sub">Ya terminaron</h3>
          <ul className="jump-done">
            {done.map((id) => {
              const r = last.get(id)!;
              return (
                <li key={id}>
                  <span>{nameOf(id)}</span>
                  <span className={`st-chip ${RESULT_CHIP[r.result]}`}>{RESULT_LABEL[r.result]}{r.result === "cleared" && r.seq > 1 ? ` (${r.seq}.º)` : ""}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {out > 0 && <p className="small muted">{plural(out, "alumno quedó", "alumnos quedaron")} afuera en alturas anteriores.</p>}
    </>
  );
}

/** Todos terminaron la altura: se termina la clase o se sube la varilla con los que pasaron. */
function FinDeAltura({ d, session, nameOf, busy, onUndo, onFinish, onNext }: {
  d: Discipline;
  session: JumpSession;
  nameOf: (id: string) => string;
  busy: boolean;
  onUndo: () => void;
  onFinish: () => void;
  onNext: (h: number) => void;
}) {
  const height = currentHeight(session);
  const pass = advancing(session);
  const last = lastResults(session);
  const order = session.rounds[session.rounds.length - 1]!.order;
  const outIds = order.filter((id) => last.get(id)?.result === "out");
  const absIds = order.filter((id) => last.get(id)?.result === "absent");
  const [raw, setRaw] = useState(() => fmtValue(Math.round((height + STEP) * 100) / 100, d));
  const p = parseEntry(d, raw);
  const err = p.absent ? "Escribí la altura de la varilla." : p.err ?? (p.value != null ? nextHeightError(session, p.value) : null);

  return (
    <div className="card saved jump-end">
      <div className="tick"><Icon name="check" size={26} /></div>
      <h2>Terminó {fmtMark(height, d)}</h2>
      <div className="g-sum">
        <div><b className="num">{pass.length}</b><span>{pass.length === 1 ? "la superó" : "la superaron"}</span></div>
        <div><b className="num">{outIds.length}</b><span>{outIds.length === 1 ? "nulo, no sigue" : "nulos, no siguen"}</span></div>
        <div><b className="num">{absIds.length}</b><span>{absIds.length === 1 ? "ausente" : "ausentes"}</span></div>
      </div>
      {pass.length > 0 ? (
        <>
          <div className="pb-list">
            <h3>Pasan a la altura siguiente</h3>
            <p className="jump-pass">{pass.map(nameOf).join(" · ")}</p>
          </div>
          <form
            className="next-h"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!err && p.value != null) onNext(p.value);
            }}
          >
            <label className="lbl" htmlFor="h-next">Nueva altura</label>
            <HeightInput d={d} raw={raw} setRaw={setRaw} id="h-next" err={err} />
            {err && <p className="hint is-err">{err}</p>}
            <div className="actions center">
              <button className="btn" type="button" disabled={busy} onClick={onFinish}>{busy ? "Guardando…" : "Fin de registro"}</button>
              <button className="btn pri" type="submit" disabled={!!err || p.value == null}>
                Nueva altura{p.value != null && !err ? `: ${fmtMark(p.value, d)} con ${pass.length}` : ""}
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p className="sub">Nadie superó {fmtMark(height, d)}: la clase termina acá.</p>
          <div className="actions center">
            <button className="btn pri" type="button" disabled={busy} onClick={onFinish}>{busy ? "Guardando…" : "Fin de registro"}</button>
          </div>
        </>
      )}
      <div className="after-links"><button className="link" type="button" onClick={onUndo}>Deshacer el último</button></div>
    </div>
  );
}

/** La clase guardada: cómo le fue a cada uno, de la altura más alta a la más baja. */
function Final({ d, f, nameOf, groupShort, update }: { d: Discipline; f: Finished; nameOf: (id: string) => string; groupShort: string; update: (p: Partial<Wizard>, replace?: boolean) => void }) {
  const best = bestIn(f.session);
  const ids = f.session.rounds[0]!.order;
  const start = f.session.rounds[0]!.height;
  const rows = ids
    .map((id) => ({ id, value: best.get(id), absent: best.has(id) && best.get(id) == null }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || Number(a.absent) - Number(b.absent));
  const pbs = new Set(f.result.personalBests.map((p) => p.studentId));
  return (
    <div className="card saved">
      <div className="tick"><Icon name="check" size={26} /></div>
      <h2>{f.queued ? "Guardado en este dispositivo" : "Salto en alto guardado"}</h2>
      <p className="sub">
        {plural(f.session.rounds.length, "altura", "alturas")}, de {fmtMark(start, d)} a {fmtMark(currentHeight(f.session), d)}.{" "}
        {f.queued ? "No hay conexión: se envía solo cuando vuelva la señal." : "Cada alumno tiene su historial de intentos en el perfil."}
      </p>
      <div className="pb-list">
        <h3>Resultado de la clase</h3>
        {rows.map((r) => (
          <Link key={r.id} className="pb-row" to={`/estudiantes/${r.id}?d=${d.id}`}>
            <span>{nameOf(r.id)}{pbs.has(r.id) && <em className="st-chip s-pb jump-pb">Marca personal</em>}</span>
            <b className="num">{r.value != null ? fmtMark(r.value, d) : r.absent ? "Ausente" : `No superó ${fmtMark(start, d)}`}</b>
          </Link>
        ))}
      </div>
      <div className="actions center">
        <button className="btn pri" type="button" autoFocus onClick={() => update({ disciplineId: null, step: 2 }, false)}>Otra disciplina con {groupShort}</button>
      </div>
      <div className="after-links"><Link className="link" to="/registros">Ver últimos registros</Link></div>
    </div>
  );
}
