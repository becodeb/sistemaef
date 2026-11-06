import { useState } from "react";
import { Link } from "react-router-dom";
import type { DisciplineCards, Rankings } from "@shared/contracts";
import { fmtMark, unitName } from "@shared/domain/marks";
import { fullName } from "@shared/domain/names";
import { COURSES, LEVELS, courseLabel, todayAR } from "@shared/domain/school";
import { Avatar, Empty, ErrorBox, GenderSeg, HouseChip, Icon, Loading, PageHead } from "../components/ui";
import { withQuery } from "../lib/api";
import { ddmm } from "../lib/format";
import { useApi, useDisciplines } from "../lib/hooks";

export function Disciplinas() {
  const [course, setCourse] = useState("1ES");
  const [gender, setGender] = useState("");
  const [picked, setPicked] = useState("");
  const { list } = useDisciplines();
  const d = list.find((x) => x.id === picked) ?? list[0];
  const schoolYear = todayAR().slice(0, 4);
  const cards = useApi<DisciplineCards>(withQuery("/api/stats/discipline-cards", { course, gender, schoolYear }));
  const table = useApi<Rankings>(d ? withQuery("/api/stats/rankings", { disciplineId: d.id, course, gender, schoolYear }) : null);

  return (
    <>
      <PageHead title="Disciplinas" sub={`Resultados de ${schoolYear} por curso, de 1.º a 6.º año.`} />
      <div className="course-tabs">
        {LEVELS.map((l) => (
          <div className="course-row" key={l.key}>
            <span className="lbl">{l.name}</span>
            <div className="year-tabs" role="group" aria-label={l.name}>
              {COURSES.filter((c) => c.endsWith(l.key)).map((c) => (
                <button key={c} type="button" aria-pressed={course === c} onClick={() => setCourse(c)}>{c[0]}.º</button>
              ))}
            </div>
          </div>
        ))}
        <GenderSeg value={gender} onChange={setGender} />
      </div>
      <div className="disc-cards">
        {list.map((x) => {
          const card = cards.data?.cards.find((c) => c.disciplineId === x.id);
          return (
            <button key={x.id} type="button" className="disc-card" aria-pressed={d?.id === x.id} onClick={() => setPicked(x.id)}>
              <span className="disc-card-top"><span className="ic"><Icon name={x.icon} /></span><span className="muted small num">{card?.count ?? 0} registros</span></span>
              <b>{x.name}</b>
              <span className="muted small">{unitName(x)[0]!.toUpperCase() + unitName(x).slice(1)} · {x.better === "hi" ? "mayor" : "menor"} {x.what.toLowerCase()} es mejor</span>
              <span className="disc-card-best"><span className="muted small">Mejor del curso</span><strong className="num">{card?.best != null ? fmtMark(card.best, x) : "—"}</strong></span>
            </button>
          );
        })}
      </div>
      <div className="card">
        <div className="card-top">
          <h2>{d?.name} · {courseLabel(course)}</h2>
          <span className="muted small">Ordenado de mejor a peor</span>
        </div>
        {table.isLoading && <Loading />}
        {table.error && <ErrorBox error={table.error} retry={() => void table.refetch()} />}
        {table.data && table.data.rows.length === 0 && <Empty title="Todavía no hay marcas para este curso" />}
        {table.data && table.data.rows.length > 0 && d && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Estudiante</th><th>House</th><th className="right">Marca</th><th className="right">Fecha</th></tr></thead>
              <tbody>
                {table.data.rows.map((r) => (
                  <tr key={r.student.id}>
                    <td><Link className="who name-btn" to={`/estudiantes/${r.student.id}?d=${d.id}`}><Avatar p={r.student} />{fullName(r.student)}</Link></td>
                    <td><HouseChip house={r.student.house} /></td>
                    <td className="mark num right nowrap">{fmtMark(r.value, d)}</td>
                    <td className="num right muted">{ddmm(r.takenOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
