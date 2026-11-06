import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RecentPage } from "@shared/contracts";
import { fmtMark, parseEntry } from "@shared/domain/marks";
import { courseLabel, groupByKey, GENDER_NAMES, todayAR } from "@shared/domain/school";
import { fullName } from "@shared/domain/names";
import { Avatar, CourseOptions, DisciplinePick, Empty, ErrorBox, GenderSeg, HouseChip, HouseOptions, Icon, Loading, PageHead, Pick } from "../components/ui";
import { withQuery } from "../lib/api";
import { listDrafts } from "../lib/drafts";
import { ddmm } from "../lib/format";
import { useApi, useDisciplines, useMe } from "../lib/hooks";

const PAGE = 15;

function SavedDrafts() {
  const { data: me } = useMe();
  const { byId } = useDisciplines();
  const nav = useNavigate();
  const drafts = useMemo(() => (me ? listDrafts(me.id) : []), [me]);
  const rows = drafts.flatMap((r) => {
    const d = byId(r.disciplineId);
    const g = groupByKey(r.group);
    if (!d || !g) return [];
    const done = Object.values(r.draft.vals).filter((v) => parseEntry(d, v).ok).length;
    return [{ ...r, d, g, done }];
  });
  if (rows.length === 0) return null;
  return (
    <div className="card">
      <h2>Planillas sin guardar</h2>
      <p className="sub">Lo que ya anotaste sigue acá, en este dispositivo, hasta que lo guardes.</p>
      {rows.map((r) => (
        <div className="open-row" key={`${r.group}${r.gender}${r.disciplineId}`}>
          <div>
            <b>{r.g.name}{r.gender ? ` · ${GENDER_NAMES[r.gender]}` : ""} · {r.d.name}</b>
            <span className="num">{r.done} anotados{r.draft.onlyIds ? ` de los ${r.draft.onlyIds.length} que faltaban` : ""} · {ddmm(r.draft.date)}</span>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              const q = new URLSearchParams({ mode: "group", step: "3", group: r.group, d: r.disciplineId });
              if (r.gender) q.set("g", r.gender);
              if (r.draft.date !== todayAR()) q.set("date", r.draft.date);
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
  const { data, isLoading, error, refetch } = useApi<RecentPage>(withQuery("/api/marks", { disciplineId, course, house, gender, limit: PAGE, offset: page * PAGE }));
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

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
        <p className="sub">Tocá un nombre para ver el perfil con todas sus marcas.</p>
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
        {error && <ErrorBox error={error} retry={() => void refetch()} />}
        {data && data.marks.length === 0 && <Empty title="Todavía no hay registros con estos filtros">Cuando se carguen marcas, aparecen acá.</Empty>}
        {data && data.marks.length > 0 && (
          <>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Alumno</th><th>Curso</th><th>House</th><th>Disciplina</th><th>Marca</th><th>Fecha</th><th>Cargó</th><th /></tr></thead>
                <tbody>
                  {data.marks.map((m) => {
                    const d = byId(m.disciplineId);
                    return (
                      <tr key={m.id}>
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
            <div className="pager">
              <span className="muted num">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, data.total)} de {data.total}</span>
              <button className="btn" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anteriores</button>
              <button className="btn" type="button" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage((p) => p + 1)}>Siguientes</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
