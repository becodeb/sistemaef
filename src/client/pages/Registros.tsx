import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MAX_DELETE, type RecentPage } from "@shared/contracts";
import { fmtMark, parseEntry } from "@shared/domain/marks";
import { courseLabel, groupByKey, GENDER_NAMES, todayAR } from "@shared/domain/school";
import { isAdmin } from "@shared/domain/roles";
import { fullName } from "@shared/domain/names";
import { toast } from "sonner";
import { Avatar, Confirm, CourseOptions, DisciplinePick, Empty, ErrorBox, GenderSeg, HouseChip, HouseOptions, Icon, Loading, PageHead, Pick } from "../components/ui";
import { api, withQuery } from "../lib/api";
import { listDrafts } from "../lib/drafts";
import { listJumps } from "../lib/jumps";
import { currentHeight, queueOf } from "@shared/domain/heights";
import { ddmm, plural } from "../lib/format";
import { refreshData, useApi, useDisciplines, useMe } from "../lib/hooks";

const PAGE = 15;

function SavedDrafts() {
  const { data: me } = useMe();
  const { byId } = useDisciplines();
  const nav = useNavigate();
  const drafts = useMemo(() => (me ? listDrafts(me.id) : []), [me]);
  const jumps = useMemo(() => (me ? listJumps(me.id) : []), [me]);
  const rows = [
    ...drafts.flatMap((r) => {
      const d = byId(r.disciplineId);
      const g = groupByKey(r.group);
      if (!d || !g) return [];
      const done = Object.values(r.draft.vals).filter((v) => parseEntry(d, v).ok).length;
      return [{ ...r, d, g, date: r.draft.date, detail: `${done} anotados${r.draft.onlyIds ? ` de los ${r.draft.onlyIds.length} que faltaban` : ""}` }];
    }),
    ...jumps.flatMap((r) => {
      const d = byId(r.disciplineId);
      const g = groupByKey(r.group);
      if (!d || !g) return [];
      const left = queueOf(r.draft.session).length;
      return [{ ...r, d, g, date: r.draft.date, detail: `En ${fmtMark(currentHeight(r.draft.session), d)} · ${left ? `faltan ${left}` : "altura terminada"}` }];
    }),
  ];
  if (rows.length === 0) return null;
  return (
    <div className="card">
      <h2>Planillas sin guardar</h2>
      <p className="sub">Lo que ya anotaste sigue acá, en este dispositivo, hasta que lo guardes o termines la clase.</p>
      {rows.map((r) => (
        <div className="open-row" key={`${r.detail}${r.group}${r.gender}${r.disciplineId}`}>
          <div>
            <b>{r.g.name}{r.gender ? ` · ${GENDER_NAMES[r.gender]}` : ""} · {r.d.name}</b>
            <span className="num">{r.detail} · {ddmm(r.date)}</span>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              const q = new URLSearchParams({ mode: "group", step: "3", group: r.group, d: r.disciplineId });
              if (r.gender) q.set("g", r.gender);
              if (r.date !== todayAR()) q.set("date", r.date);
              nav(`/registros/nuevo?${q}`);
            }}
          >
            Seguir
          </button>
        </div>
      ))}
    </div>
  );
}

export function Registros() {
  const nav = useNavigate();
  const { list, byId } = useDisciplines();
  const [disciplineId, setDisciplineId] = useState("");
  const [course, setCourse] = useState("");
  const [house, setHouse] = useState("");
  const [gender, setGender] = useState("");
  const [page, setPage] = useState(0);
  const filter = { disciplineId, course, house, gender };
  const { data, isLoading, error, refetch } = useApi<RecentPage>(withQuery("/api/marks", { ...filter, limit: PAGE, offset: page * PAGE }));
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
    // Con otro filtro quedarían elegidos registros que ya no se ven.
    setSel(new Set());
  };

  // Borrado de varios, solo admins. Lo elegido se mantiene al pasar de página.
  const { data: me } = useMe();
  const canDelete = !!me && isAdmin(me.role);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = data?.total ?? 0;
  const pageIds = data?.marks.map((m) => m.id) ?? [];
  const onPage = pageIds.filter((id) => sel.has(id)).length;
  const allOnPage = pageIds.length > 0 && onPage === pageIds.length;
  const toggle = (ids: string[], on: boolean) =>
    setSel((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const selectAll = async () => {
    setBusy(true);
    try {
      const { ids } = await api.get<{ ids: string[] }>(withQuery("/api/marks/ids", filter));
      setSel(new Set(ids));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const { deleted } = await api.post<{ deleted: number }>("/api/marks/delete", { ids: [...sel] });
      toast.success(deleted === 1 ? "Registro borrado" : `${deleted} registros borrados`);
      setSel(new Set());
      setConfirming(false);
      void refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // Si se borró la última página, vuelve a la última que queda.
  useEffect(() => {
    if (data && page > 0 && page * PAGE >= data.total) setPage(Math.max(0, Math.ceil(data.total / PAGE) - 1));
  }, [data, page]);

  return (
    <>
      <PageHead title="Registros" sub="Tomá marcas y mirá lo que se fue cargando." />
      <div className="card">
        <h2>Nuevo registro</h2>
        <p className="sub">¿A quién le vas a tomar la marca?</p>
        <div className="doors">
          <button className="door" type="button" onClick={() => nav("/registros/nuevo?mode=one")}>
            <span className="ic"><Icon name="user" size={21} /></span>
            <span><b>Un alumno</b><span>Lo buscás, elegís la disciplina y cargás la marca. Todas las que quieras: cada una queda en su perfil.</span></span>
          </button>
          <button className="door" type="button" onClick={() => nav("/registros/nuevo?mode=group")}>
            <span className="ic"><Icon name="users" size={21} /></span>
            <span><b>Todo un curso o house</b><span>Elegís el grupo y la disciplina, y cargás a todos: uno por uno en orden o en la planilla.</span></span>
          </button>
        </div>
      </div>
      <SavedDrafts />
      <div className="card">
        <h2>Últimos registros</h2>
        <p className="sub">Tocá un nombre para ver el perfil con todas sus marcas.{canDelete && " Para borrar, tildá los registros."}</p>
        <div className="filters">
          <Pick id="f-disc" label="Disciplina" value={disciplineId} onChange={reset(setDisciplineId)}>
            <option value="">Todas</option>
            {list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Pick>
          <Pick id="f-course" label="Curso" value={course} onChange={reset(setCourse)}><CourseOptions all="Todos" /></Pick>
          <Pick id="f-house" label="House" value={house} onChange={reset(setHouse)}><HouseOptions all="Todos" /></Pick>
          <GenderSeg value={gender} onChange={reset(setGender)} />
        </div>
        {isLoading && <Loading />}
        {error && !data && <ErrorBox error={error} retry={() => void refetch()} />}
        {data && data.marks.length === 0 && <Empty title="Todavía no hay registros con estos filtros">Cuando se carguen marcas, aparecen acá.</Empty>}
        {data && data.marks.length > 0 && (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    {canDelete && (
                      <th className="c-sel">
                        <label>
                          <input
                            type="checkbox"
                            aria-label="Elegir todos los de esta página"
                            checked={allOnPage}
                            ref={(el) => {
                              if (el) el.indeterminate = onPage > 0 && !allOnPage;
                            }}
                            onChange={(e) => toggle(pageIds, e.target.checked)}
                          />
                        </label>
                      </th>
                    )}
                    <th>Alumno</th><th>Curso</th><th>House</th><th>Disciplina</th><th>Marca</th><th>Fecha</th><th>Cargó</th><th />
                  </tr>
                </thead>
                <tbody>
                  {data.marks.map((m) => {
                    const d = byId(m.disciplineId);
                    return (
                      <tr key={m.id} className={sel.has(m.id) ? "row-sel" : undefined}>
                        {canDelete && (
                          <td className="c-sel">
                            <label>
                              <input type="checkbox" aria-label={`Elegir el registro de ${fullName(m.student)} del ${ddmm(m.takenOn)}`} checked={sel.has(m.id)} onChange={(e) => toggle([m.id], e.target.checked)} />
                            </label>
                          </td>
                        )}
                        <td><Link className="who name-btn" to={`/estudiantes/${m.studentId}?d=${m.disciplineId}`}><Avatar p={m.student} />{fullName(m.student)}</Link></td>
                        <td className="num nowrap">{courseLabel(m.courseAt)}</td>
                        <td><HouseChip house={m.student.house} /></td>
                        <td>{d?.name ?? "—"}</td>
                        <td className="mark num nowrap">{m.value == null ? "Ausente" : d ? fmtMark(m.value, d) : m.value}</td>
                        <td className="num">{ddmm(m.takenOn)}</td>
                        <td className="muted">{m.createdByName}</td>
                        <td>{m.isPb && <span className="tag">Marca personal</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sel.size > 0 && (
              <div className="sel-bar" role="region" aria-label="Registros elegidos">
                <b className="num" role="status">{plural(sel.size, "elegido", "elegidos")}</b>
                <button className="link" type="button" onClick={() => setSel(new Set())}>Quitar selección</button>
                {allOnPage && sel.size < Math.min(total, MAX_DELETE) && (
                  <button className="btn" type="button" disabled={busy} onClick={() => void selectAll()}>{total > MAX_DELETE ? `Elegir los últimos ${MAX_DELETE}` : `Elegir los ${total}`}</button>
                )}
                <button className="btn danger" type="button" disabled={busy || sel.size > MAX_DELETE} onClick={() => setConfirming(true)}>Borrar</button>
              </div>
            )}
            <div className="pager">
              <span className="muted num">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, data.total)} de {data.total}</span>
              <button className="btn" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anteriores</button>
              <button className="btn" type="button" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage((p) => p + 1)}>Siguientes</button>
            </div>
          </>
        )}
      </div>
      <Confirm open={confirming} title={sel.size === 1 ? "¿Borrar este registro?" : `¿Borrar ${sel.size} registros?`} action={sel.size === 1 ? "Borrar" : `Borrar ${sel.size}`} danger busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void remove()}>
        <p>Se borran las marcas elegidas de los perfiles y se recalculan las marcas personales. No se puede deshacer.</p>
      </Confirm>
    </>
  );
}
