import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Student } from "@shared/contracts";
import { GENDER_ONE, HOUSE_NAMES, courseLabel } from "@shared/domain/school";
import { fullName, listName, matchesName } from "@shared/domain/names";
import { isAdmin } from "@shared/domain/roles";
import { Avatar, CourseOptions, Empty, ErrorBox, GenderSeg, HouseChip, HouseOptions, Icon, Loading, PageHead, Pick } from "../components/ui";
import { withQuery } from "../lib/api";
import { useApi, useMe } from "../lib/hooks";

const STEP = 60;

export function Estudiantes() {
  const [params] = useSearchParams();
  const { data: me } = useMe();
  const admin = !!me && isAdmin(me.role);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [course, setCourse] = useState("");
  const [house, setHouse] = useState("");
  const [gender, setGender] = useState("");
  const [shown, setShown] = useState(STEP);
  const { data, isLoading, error, refetch } = useApi<Student[]>(withQuery("/api/students", { course, house, gender }));
  const rows = useMemo(() => (q.trim() ? (data ?? []).filter((s) => matchesName(s, q, `${s.course} ${HOUSE_NAMES[s.house]}`)) : (data ?? [])), [data, q]);

  return (
    <>
      <PageHead
        title="Estudiantes"
        sub={data ? `${rows.length} ${rows.length === 1 ? "alumno" : "alumnos"}` : undefined}
        actions={admin ? <Link className="btn" to="/admin/alumnos">Administrar alumnos</Link> : undefined}
      />
      <div className="card">
        <div className="filters">
          <div className="pick grow">
            <label className="lbl" htmlFor="est-q">Buscar</label>
            <div className="search"><Icon name="search" /><input id="est-q" type="text" autoComplete="off" placeholder="Nombre, apellido o curso" value={q} onChange={(e) => { setQ(e.target.value); setShown(STEP); }} /></div>
          </div>
          <Pick id="est-course" label="Curso" value={course} onChange={setCourse}><CourseOptions all="Todos" /></Pick>
          <Pick id="est-house" label="House" value={house} onChange={setHouse}><HouseOptions all="Todos" /></Pick>
          <GenderSeg value={gender} onChange={setGender} />
        </div>
        {isLoading && <Loading />}
        {error && <ErrorBox error={error} retry={() => void refetch()} />}
        {data && rows.length === 0 && (
          <Empty title={data.length === 0 ? "Todavía no hay alumnos cargados" : "No hay alumnos con esos filtros"}>
            {data.length === 0 && (admin ? <Link className="link" to="/admin/alumnos">Importá la lista de alumnos</Link> : "Un administrador tiene que cargar la lista.")}
          </Empty>
        )}
        {rows.length > 0 && (
          <div className="tbl-wrap">
            <table className="table-compact">
              <thead><tr><th>Alumno</th><th>Curso</th><th>House</th><th>Sexo</th></tr></thead>
              <tbody>
                {rows.slice(0, shown).map((s) => (
                  <tr key={s.id}>
                    <td><Link className="who name-btn" to={`/estudiantes/${s.id}`} aria-label={fullName(s)}><Avatar p={s} />{listName(s)}</Link></td>
                    <td className="num nowrap">{courseLabel(s.course)}</td>
                    <td><HouseChip house={s.house} /></td>
                    <td className="muted">{s.gender ? GENDER_ONE[s.gender] : "Sin definir"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown && (
          <div className="pager"><button className="btn" type="button" onClick={() => setShown((n) => n + STEP)}>Ver más ({rows.length - shown})</button></div>
        )}
      </div>
    </>
  );
}
