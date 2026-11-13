import { useState } from "react";
import { Link } from "react-router-dom";
import type { BestByGender, HistoricRecords, Rankings as RankingsData } from "@shared/contracts";
import { fmtMark, fmtSigned, isBetter } from "@shared/domain/marks";
import { fullName } from "@shared/domain/names";
import { HOUSE_NAMES, courseLabel, todayAR } from "@shared/domain/school";
import { CourseOptions, DisciplinePick, Empty, ErrorBox, GenderSeg, HouseOptions, Icon, Loading, PageHead, Pick } from "../components/ui";
import { withQuery } from "../lib/api";
import { useApi, useDisciplines } from "../lib/hooks";

function RecordRow({ rec, label, d }: { rec: BestByGender["m"]; label: string; d: Parameters<typeof fmtMark>[1] }) {
  if (!rec) return null;
  return (
    <div className="record-line">
      <span className="muted small">{label} · {fullName(rec.student)} · {courseLabel(rec.courseAt)} · {rec.takenOn.slice(0, 4)}</span>
      <b className="num">{fmtMark(rec.value, d)}</b>
    </div>
  );
}

export function Rankings() {
  const { list, byId } = useDisciplines();
  const [picked, setPicked] = useState("");
  const [course, setCourse] = useState("");
  const [house, setHouse] = useState("");
  const [gender, setGender] = useState("");
  const [schoolYear, setSchoolYear] = useState(todayAR().slice(0, 4));
  const d = list.find((x) => x.id === picked) ?? list[0];
  const { data, isLoading, error, refetch } = useApi<RankingsData>(d ? withQuery("/api/stats/rankings", { disciplineId: d.id, course, house, gender, schoolYear }) : null);
  const records = useApi<HistoricRecords>("/api/stats/records");
  const scope = [course ? courseLabel(course) : "Todos los cursos", house && `House ${HOUSE_NAMES[house]}`, gender === "m" ? "Mujeres" : gender === "h" ? "Hombres" : ""].filter(Boolean).join(" · ");

  return (
    <>
      <PageHead title="Rankings y récords" sub="Los mejores resultados por disciplina, curso, house y año escolar." />
      <div className="filters">
        <DisciplinePick id="r-disc" value={d?.id ?? ""} onChange={setPicked} list={list} />
        <Pick id="r-course" label="Curso" value={course} onChange={setCourse}><CourseOptions all="Todos" /></Pick>
        <Pick id="r-house" label="House" value={house} onChange={setHouse}><HouseOptions all="Todos" /></Pick>
        <Pick id="r-year" label="Año escolar" value={schoolYear} onChange={setSchoolYear}>
          <option value="todos">Todos</option>
          {(data?.schoolYears ?? [Number(todayAR().slice(0, 4))]).map((y) => <option key={y} value={y}>{y}</option>)}
        </Pick>
        <GenderSeg value={gender} onChange={setGender} />
      </div>
      <div className="grid">
        <div className="card">
          <div className="card-top">
            <h2>{d?.name} · {scope}</h2>
            {d && <span className="muted small">{d.better === "hi" ? "Mayor" : "Menor"} {d.what.toLowerCase()} = mejor resultado</span>}
          </div>
          {isLoading && <Loading />}
          {error && !data && <ErrorBox error={error} retry={() => void refetch()} />}
          {data && data.rows.length === 0 && <Empty title="Todavía no hay marcas con estos filtros" />}
          {data && data.rows.length > 0 && d && (
            <div className="tbl-wrap">
              <table className="ranking">
                <thead><tr><th>Posición</th><th>Estudiante</th><th className="right">Marca</th><th className="right">Diferencia</th><th className="right">Vs. la anterior</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.student.id} className={r.position === 1 ? "leader" : ""}>
                      <td className="pos num">{r.position}.º</td>
                      <td>
                        <Link className="name-btn" to={`/estudiantes/${r.student.id}?d=${d.id}`}>{fullName(r.student)}</Link>
                        <small className="block muted">{courseLabel(r.courseAt)} · {HOUSE_NAMES[r.student.house]}</small>
                        {r.position === 1 && <span className="tag">Mejor marca</span>}
                        {r.position !== 1 && r.isRecentPb && <span className="tag soft">Nueva marca personal</span>}
                      </td>
                      <td className="mark num right nowrap">{fmtMark(r.value, d)}</td>
                      <td className="num right muted nowrap">{r.diffFirst != null ? fmtSigned(r.diffFirst, d) : "—"}</td>
                      <td className={`num right nowrap${r.vsPrevious != null && isBetter(d, r.vsPrevious, 0) ? " up" : " muted"}`}>{r.vsPrevious ? fmtSigned(r.vsPrevious, d) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="stack">
          {data && data.houses.length > 0 && d && (
            <div className="card">
              <h2>Por house</h2>
              <p className="sub">Promedio de la mejor marca de cada alumno</p>
              <ul className="house-list">
                {data.houses.map((h, i) => (
                  <li key={h.house}>
                    <span className="pos num">{i + 1}.º</span>
                    <span className="grow"><i className="house-dot" style={{ background: `var(--h-${h.house})` }} />{HOUSE_NAMES[h.house]}<small className="block muted">{h.students} alumnos · mejor {fmtMark(h.best, d)}</small></span>
                    <b className="num">{fmtMark(h.average, d)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card">
            <h2>Récords del colegio</h2>
            <p className="sub">Las mejores marcas cargadas en RÉCORD</p>
            {records.data?.records.map((rec) => {
              const x = byId(rec.disciplineId);
              if (!x) return null;
              return (
                <div className="record" key={rec.disciplineId}>
                  <b>{x.name}</b>
                  {!rec.m && !rec.h && <p className="muted small">Sin marcas todavía.</p>}
                  <RecordRow rec={rec.m} label="Mujeres" d={x} />
                  <RecordRow rec={rec.h} label="Hombres" d={x} />
                </div>
              );
            })}
          </div>
          <div className="card">
            <h2 className="with-icon"><Icon name="shield" />¿Quién ve este ranking?</h2>
            <p className="muted small">Solo los admins. Los docentes cargan marcas y ven a los alumnos, y los chicos no tienen acceso a la app.</p>
          </div>
        </div>
      </div>
    </>
  );
}
