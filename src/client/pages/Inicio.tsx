import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Coverage, Dashboard, Discipline, Evolution, NamedBest } from "@shared/contracts";
import { fmtMark, fmtSigned, fmtValue } from "@shared/domain/marks";
import { fullName } from "@shared/domain/names";
import { courseLabel } from "@shared/domain/school";
import { LineChart } from "../components/LineChart";
import { Avatar, CourseOptions, Empty, ErrorBox, Icon, Loading, Pick } from "../components/ui";
import { withQuery } from "../lib/api";
import { monthLabel } from "../lib/format";
import { useApi, useDisciplines } from "../lib/hooks";

function BestCell({ best, d }: { best: NamedBest | null; d: Discipline }) {
  if (!best) return <td className="muted">—</td>;
  return (
    <td>
      <b className="num">{fmtMark(best.value, d)}</b>
      <small className="block muted"><Link className="name-btn" to={`/estudiantes/${best.student.id}?d=${d.id}`}>{fullName(best.student)}</Link> · {courseLabel(best.courseAt)}</small>
    </td>
  );
}

function EvolutionCard({ list, schoolYear }: { list: Discipline[]; schoolYear: number }) {
  const [disciplineId, setDisciplineId] = useState("");
  const [course, setCourse] = useState("");
  const d = list.find((x) => x.id === disciplineId) ?? list[0];
  const { data } = useApi<Evolution>(d ? withQuery("/api/stats/evolution", { disciplineId: d.id, course, schoolYear }) : null);
  const points = data?.points ?? [];
  const last = points[points.length - 1];
  return (
    <div className="card">
      <div className="card-top">
        <div><h2>Evolución promedio</h2><p className="sub">{d?.name} · {course ? courseLabel(course) : "todos los cursos"} · promedio por mes</p></div>
        {last && d && <span className="muted small">Promedio actual <b className="acc num">{fmtMark(last.average, d)}</b></span>}
      </div>
      <div className="filters">
        <Pick id="ev-disc" label="Disciplina" value={d?.id ?? ""} onChange={setDisciplineId}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Pick>
        <Pick id="ev-course" label="Curso" value={course} onChange={setCourse}><CourseOptions all="Todos" /></Pick>
      </div>
      {d && points.length > 0 ? (
        <LineChart title={`Evolución promedio de ${d.name}`} invert={d.better === "lo"} fmt={(v) => fmtValue(v, d)} points={points.map((p) => ({ label: monthLabel(p.month), value: p.average, detail: `${p.count} marcas` }))} />
      ) : (
        <Empty title="Todavía no hay marcas este año" />
      )}
    </div>
  );
}

function CoverageCard({ list, schoolYear }: { list: Discipline[]; schoolYear: number }) {
  const [disciplineId, setDisciplineId] = useState("");
  const d = list.find((x) => x.id === disciplineId) ?? list[0];
  const { data } = useApi<Coverage>(d ? withQuery("/api/stats/coverage", { disciplineId: d.id, schoolYear }) : null);
  return (
    <div className="card">
      <h2>Carga de resultados por curso</h2>
      <p className="sub">Alumnos con al menos una marca este año</p>
      <div className="filters"><Pick id="cov-disc" label="Disciplina" value={d?.id ?? ""} onChange={setDisciplineId}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Pick></div>
      <ul className="cov">
        {(data?.rows ?? []).map((r) => {
          const pct = r.students ? Math.round((r.withMark / r.students) * 100) : 0;
          return (
            <li key={r.course} title={`${r.withMark} de ${r.students} alumnos`}>
              <span className="num">{courseLabel(r.course)}</span>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <span className="num">{pct} %</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Inicio() {
  const nav = useNavigate();
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const { list, byId } = useDisciplines();
  const { data, isLoading, error, refetch } = useApi<Dashboard>(withQuery("/api/stats/dashboard", { schoolYear: year }));

  const search = (e: FormEvent) => {
    e.preventDefault();
    nav(withQuery("/estudiantes", { q }));
  };

  return (
    <>
      <div className="top-tools">
        <form className="search grow" onSubmit={search} role="search">
          <Icon name="search" />
          <input aria-label="Buscar estudiante o curso" type="search" placeholder="Buscar estudiante o curso" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="inline-pick">
          <label className="lbl" htmlFor="in-year">Año escolar</label>
          <select className="sel" id="in-year" value={year || data?.schoolYear || ""} onChange={(e) => setYear(e.target.value)}>
            {(data?.schoolYears ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="head"><div><h1>Resumen deportivo</h1><p className="head-sub">Todos los cursos · {data?.schoolYear ?? ""}</p></div></div>
      {isLoading && <Loading />}
      {error && <ErrorBox error={error} retry={() => void refetch()} />}
      {data && (
        <>
          {data.students === 0 && (
            <div className="notice">
              <p>Todavía no hay alumnos cargados.</p>
              <Link className="btn pri" to="/admin/alumnos">Importar la lista de alumnos</Link>
            </div>
          )}
          <div className="stats four">
            <div className="card stat"><span>Estudiantes registrados</span><b className="num">{data.students.toLocaleString("es-AR")}</b><small>Primaria y secundaria</small></div>
            <div className="card stat"><span>Disciplinas disponibles</span><b className="num">{data.disciplines}</b><small>Con su propia medición</small></div>
            <div className="card stat"><span>Resultados cargados</span><b className="num">{data.results.toLocaleString("es-AR")}</b><small>En {data.schoolYear}</small></div>
            <div className="card stat"><span>Marcas personales</span><b className="num acc">{data.personalBests.toLocaleString("es-AR")}</b><small>Superaron su mejor marca</small></div>
          </div>
          <div className="grid half">
            <EvolutionCard list={list} schoolYear={data.schoolYear} />
            <div className="card">
              <div className="card-top"><h2>Mejores marcas del año</h2><Link className="link" to="/rankings">Ver rankings</Link></div>
              <div className="tbl-wrap">
                <table className="table-free">
                  <thead><tr><th>Disciplina</th><th>Mujeres</th><th>Hombres</th></tr></thead>
                  <tbody>
                    {data.bestOfYear.map((b) => {
                      const d = byId(b.disciplineId);
                      return d ? (
                        <tr key={b.disciplineId}><td>{d.name}</td><BestCell best={b.m} d={d} /><BestCell best={b.h} d={d} /></tr>
                      ) : null;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="grid half">
            <div className="card">
              <h2>Se destacan</h2>
              <p className="sub">Las últimas marcas personales</p>
              {data.highlights.length === 0 && <Empty title="Todavía no hay marcas personales este año" />}
              <ul className="highlights">
                {data.highlights.map((h, i) => {
                  const d = byId(h.disciplineId);
                  return d ? (
                    <li key={i}>
                      <Avatar p={h.student} />
                      <div className="grow">
                        <Link className="name-btn" to={`/estudiantes/${h.student.id}?d=${d.id}`}><b>{fullName(h.student)}</b> · {courseLabel(h.student.course)}</Link>
                        <small className="block muted">{d.name} · nueva mejor marca: {fmtMark(h.value, d)}</small>
                      </div>
                      <span className="tag num">{fmtSigned(h.delta, d)}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
            <CoverageCard list={list} schoolYear={data.schoolYear} />
          </div>
        </>
      )}
    </>
  );
}
