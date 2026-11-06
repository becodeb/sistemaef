import { useState } from "react";
import { Link } from "react-router-dom";
import type { Progress } from "@shared/contracts";
import { fmtDiff, fmtMark, fmtValue } from "@shared/domain/marks";
import { fullName } from "@shared/domain/names";
import { courseLabel, HOUSE_NAMES, todayAR } from "@shared/domain/school";
import { LineChart } from "../components/LineChart";
import { CourseOptions, DisciplinePick, Empty, ErrorBox, GenderSeg, HouseOptions, Loading, PageHead, Pick } from "../components/ui";
import { withQuery } from "../lib/api";
import { monthLabel } from "../lib/format";
import { useApi, useDisciplines } from "../lib/hooks";

export function Progreso() {
  const { list } = useDisciplines();
  const [picked, setPicked] = useState("");
  const [course, setCourse] = useState("");
  const [house, setHouse] = useState("");
  const [gender, setGender] = useState("");
  const [schoolYear, setSchoolYear] = useState(todayAR().slice(0, 4));
  const d = list.find((x) => x.id === picked) ?? list[0];
  const { data, isLoading, error, refetch } = useApi<Progress>(d ? withQuery("/api/stats/progress", { disciplineId: d.id, course, house, gender, schoolYear }) : null);
  const rows = data?.rows ?? [];
  const compared = rows.filter((r) => r.marks > 1);
  const improved = compared.filter((r) => r.progress > 0).length;

  return (
    <>
      <PageHead title="Progreso" sub="Cuánto mejoró cada alumno desde su primera marca del período." />
      <div className="filters">
        <DisciplinePick id="p-disc" value={d?.id ?? ""} onChange={setPicked} list={list} />
        <Pick id="p-course" label="Curso" value={course} onChange={setCourse}><CourseOptions all="Todos" /></Pick>
        <Pick id="p-house" label="House" value={house} onChange={setHouse}><HouseOptions all="Todos" /></Pick>
        <Pick id="p-year" label="Año escolar" value={schoolYear} onChange={setSchoolYear}>
          <option value="todos">Todos</option>
          {(data?.schoolYears ?? [Number(todayAR().slice(0, 4))]).map((y) => <option key={y} value={y}>{y}</option>)}
        </Pick>
        <GenderSeg value={gender} onChange={setGender} />
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox error={error} retry={() => void refetch()} />}
      {data && d && rows.length === 0 && <div className="card"><Empty title="Todavía no hay marcas con estos filtros" /></div>}
      {data && d && rows.length > 0 && (
        <>
          <div className="stats">
            <div className="card stat"><span>Alumnos con marcas</span><b className="num">{rows.length}</b><small>En {d.name.toLowerCase()}</small></div>
            <div className="card stat"><span>Con más de una marca</span><b className="num">{compared.length}</b><small>Se pueden comparar</small></div>
            <div className="card stat"><span>Mejoraron</span><b className="num acc">{improved}</b><small>Superaron su primera marca</small></div>
          </div>
          <div className="card">
            <div className="card-top">
              <div><h2>Evolución promedio · {d.name}</h2><p className="sub">Promedio por mes</p></div>
              <span className="muted small">Hacia arriba = mejor resultado</span>
            </div>
            <LineChart title={`Evolución promedio de ${d.name}`} invert={d.better === "lo"} fmt={(v) => fmtValue(v, d)} points={data.evolution.map((p) => ({ label: monthLabel(p.month), value: p.average, detail: `${p.count} marcas` }))} />
          </div>
          <div className="card">
            <h2>Alumno por alumno</h2>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Estudiante</th><th>Curso</th><th>House</th><th className="right">Primera</th><th className="right">Mejor</th><th className="right">Progreso</th><th className="right">Marcas</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.student.id}>
                      <td><Link className="name-btn" to={`/estudiantes/${r.student.id}?d=${d.id}`}>{fullName(r.student)}</Link></td>
                      <td className="num nowrap">{courseLabel(r.student.course)}</td>
                      <td>{HOUSE_NAMES[r.student.house]}</td>
                      <td className="num right muted nowrap">{fmtMark(r.first, d)}</td>
                      <td className="mark num right nowrap">{fmtMark(r.best, d)}</td>
                      <td className={`num right nowrap${r.progress > 0 ? " up" : " muted"}`}>{r.marks > 1 && r.progress > 0 ? `+${fmtDiff(r.progress, d)}` : "—"}</td>
                      <td className="num right muted">{r.marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
