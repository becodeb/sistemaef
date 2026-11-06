// Los 3 pasos del dibujo: Nuevo registro (en /registros), elegir a quién y qué, y cargar. Todo queda en la URL:
// recargar o usar «atrás» en el teléfono no pierde el lugar.
import { Link, useSearchParams } from "react-router-dom";
import { todayAR, groupByKey } from "@shared/domain/school";
import { Icon } from "../../components/ui";
import { CargaGrupo } from "./CargaGrupo";
import { CargaIndividual } from "./CargaIndividual";
import { PasoDos } from "./PasoDos";

export type Wizard = {
  mode: "one" | "group";
  step: 2 | 3;
  student: string | null;
  disciplineId: string | null;
  group: string | null;
  gender: string;
  way: "seq" | "sheet";
  date: string;
};

export function NuevoRegistro() {
  const [params, setParams] = useSearchParams();
  const wiz: Wizard = {
    mode: params.get("mode") === "group" ? "group" : "one",
    step: params.get("step") === "3" ? 3 : 2,
    student: params.get("student"),
    disciplineId: params.get("d"),
    group: params.get("group"),
    gender: params.get("g") ?? "",
    way: params.get("way") === "sheet" ? "sheet" : "seq",
    date: params.get("date") ?? todayAR(),
  };
  const update = (patch: Partial<Wizard>, replace = true) => {
    const next = { ...wiz, ...patch };
    const q = new URLSearchParams();
    q.set("mode", next.mode);
    if (next.step === 3) q.set("step", "3");
    if (next.student) q.set("student", next.student);
    if (next.disciplineId) q.set("d", next.disciplineId);
    if (next.group) q.set("group", next.group);
    if (next.gender) q.set("g", next.gender);
    if (next.way === "sheet") q.set("way", "sheet");
    if (next.date !== todayAR()) q.set("date", next.date);
    setParams(q, { replace });
  };

  const ready = wiz.mode === "group" ? !!(groupByKey(wiz.group) && wiz.disciplineId) : !!(wiz.student && wiz.disciplineId);
  const onThree = wiz.step === 3 && ready;
  const names = wiz.mode === "group" ? ["Nuevo registro", "Grupo y disciplina", "Cargar marcas"] : ["Nuevo registro", "Alumno y disciplina", "Cargar marca"];
  const current = onThree ? 3 : 2;

  return (
    <div className={onThree && wiz.mode === "group" ? "is-work" : ""}>
      <div className="head">
        <div>
          <div className="crumb"><Link to="/registros">Registros</Link> / Nuevo registro</div>
          <h1>{wiz.mode === "group" ? "Registrar marcas" : "Registrar una marca"}</h1>
        </div>
      </div>
      <ol className="steps" aria-label="Avance del registro">
        {names.map((n, i) => {
          const k = i + 1;
          const cls = k < current ? "done" : k === current ? "cur" : "";
          const go = k === 1 ? null : k === 2 ? () => update({ step: 2 }, false) : ready ? () => update({ step: 3 }, false) : undefined;
          const body = (
            <>
              <span className="dot">{k < current ? <Icon name="check" /> : k}</span>{n}
            </>
          );
          return (
            <li key={n}>
              {k === 1 ? (
                <Link className={`step ${cls}`} to="/registros">{body}</Link>
              ) : (
                <button className={`step ${cls}`} type="button" disabled={k === current || !go} aria-current={k === current ? "step" : undefined} onClick={go ?? undefined}>{body}</button>
              )}
            </li>
          );
        })}
      </ol>
      {!onThree && <PasoDos wiz={wiz} update={update} ready={ready} />}
      {onThree && wiz.mode === "one" && <CargaIndividual key={`${wiz.student}:${wiz.disciplineId}`} wiz={wiz} update={update} />}
      {onThree && wiz.mode === "group" && <CargaGrupo key={`${wiz.group}:${wiz.gender}:${wiz.disciplineId}`} wiz={wiz} update={update} />}
    </div>
  );
}
