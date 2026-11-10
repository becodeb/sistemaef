import { useEffect, useMemo, useRef, useState } from "react";
import type { Me, Student } from "@shared/contracts";
import { COURSES, GENDER_NAMES, HOUSES, LEVELS, courseLabel, groupByKey, groupKeyOf, todayAR } from "@shared/domain/school";
import { fullName, matchesName } from "@shared/domain/names";
import { parseEntry } from "@shared/domain/marks";
import { Avatar, DisciplineTiles, Icon, Loading, StudentFacts } from "../../components/ui";
import { loadDraft } from "../../lib/drafts";
import { useApi, useDisciplines, useMe } from "../../lib/hooks";
import { HOUSE_NAMES } from "@shared/domain/school";
import type { Wizard } from "./NuevoRegistro";

type Props = { wiz: Wizard; update: (p: Partial<Wizard>, replace?: boolean) => void; ready: boolean };

function ModeSeg({ wiz, update }: Pick<Props, "wiz" | "update">) {
  return (
    <div className="field">
      <span className="lbl">¿A quién le tomás la marca?</span>
      <div className="seg wide" role="group" aria-label="A quién le tomás la marca">
        <button type="button" aria-pressed={wiz.mode === "one"} onClick={() => update({ mode: "one" })}><Icon name="user" />Un alumno</button>
        <button type="button" aria-pressed={wiz.mode === "group"} onClick={() => update({ mode: "group" })}><Icon name="users" />Curso o house</button>
      </div>
    </div>
  );
}

function StudentPicker({ wiz, update }: Pick<Props, "wiz" | "update">) {
  const { data: students, isLoading } = useApi<Student[]>("/api/students");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const picked = students?.find((s) => s.id === wiz.student);
  const matches = useMemo(() => {
    if (!students) return [];
    const list = q.trim() ? students.filter((s) => matchesName(s, q, `${s.course} ${HOUSE_NAMES[s.house]}`)) : students;
    return list.slice(0, 40);
  }, [students, q]);

  if (isLoading) return <Loading />;
  if (picked) {
    return (
      <div className="picked">
        <Avatar p={picked} lg />
        <div className="grow">
          <div className="nm">{fullName(picked)}</div>
          <StudentFacts s={picked} />
        </div>
        <button className="link" type="button" onClick={() => update({ student: null })}>Cambiar</button>
      </div>
    );
  }
  return (
    <div className="combo" ref={box}>
      <div className="search">
        <Icon name="search" />
        <input
          id="alumno-q"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="alumno-list"
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Buscá por nombre, apellido o curso (por ej. 4ES)"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const s = matches[hi];
              if (s) update({ student: s.id });
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && (
        <ul className="opts" id="alumno-list" role="listbox">
          {matches.length === 0 && <li className="opt-empty">No hay alumnos que coincidan con «{q}». Probá con el apellido o el curso.</li>}
          {matches.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === hi} onPointerDown={(e) => e.preventDefault()} onClick={() => update({ student: s.id })}>
              <Avatar p={s} />
              <span className="nm">{fullName(s)}</span>
              <span className="meta num">{courseLabel(s.course)} · {HOUSE_NAMES[s.house]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupPicker({ wiz, update }: Pick<Props, "wiz" | "update">) {
  // Curso y house se eligen por separado y se combinan: c:6ES, h:earth o c:6ES+h:earth.
  const g = groupByKey(wiz.group);
  const pick = (course?: string | null, house?: string | null) => update({ group: groupKeyOf(course, house) });
  const btn = (key: string, label: string, on: boolean, onClick: () => void) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick}><b className="num">{label}</b></button>
  );
  return (
    <>
      <p className="hint first">Elegí un curso, un house o los dos: por ejemplo 6.º ES solo de Earth. Tocá de nuevo para sacarlo.</p>
      {LEVELS.map((l) => (
        <div className="field" key={l.key}>
          <span className="lbl">{l.name}</span>
          <div className="gpick">
            {COURSES.filter((c) => c.endsWith(l.key)).map((c) => btn(c, courseLabel(c), g?.course === c, () => pick(g?.course === c ? null : c, g?.house)))}
          </div>
        </div>
      ))}
      <div className="field">
        <span className="lbl">House</span>
        <div className="gpick teams">{HOUSES.map((h) => btn(h, HOUSE_NAMES[h]!, g?.house === h, () => pick(g?.course, g?.house === h ? null : h)))}</div>
      </div>
      <div className="field">
        <span className="lbl">¿Quiénes?</span>
        <div className="seg" role="group" aria-label="Quiénes">
          {([["", "Todos"], ["m", GENDER_NAMES.m], ["h", GENDER_NAMES.h]] as const).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={wiz.gender === v} onClick={() => update({ gender: v })}>{t}</button>
          ))}
        </div>
      </div>
    </>
  );
}

export function PasoDos({ wiz, update, ready }: Props) {
  const { list, byId, isLoading } = useDisciplines();
  const { data: me } = useMe();
  const missing = wiz.mode === "group" ? (!wiz.group ? "Falta elegir un curso, un house o los dos." : !wiz.disciplineId ? "Falta elegir la disciplina." : "") : !wiz.student ? "Falta elegir el alumno." : !wiz.disciplineId ? "Falta elegir la disciplina." : "";
  const d = byId(wiz.disciplineId);
  const draft = wiz.mode === "group" && ready && d && me ? loadDraft((me as Me).id, { group: wiz.group!, gender: wiz.gender, disciplineId: d.id }) : null;
  const anotados = draft && d ? Object.values(draft.vals).filter((v) => parseEntry(d, v).ok).length : 0;

  const way = (k: Wizard["way"], icon: string, name: string, txt: string) => (
    <button type="button" aria-pressed={wiz.way === k} onClick={() => update({ way: k })}>
      <span className="ic"><Icon name={icon} /></span>
      <span><b>{name}</b><span>{txt}</span></span>
    </button>
  );

  return (
    <div className="card">
      <ModeSeg wiz={wiz} update={update} />
      {wiz.mode === "one" ? (
        <div className="field">
          <label className="lbl" htmlFor="alumno-q">Alumno</label>
          <StudentPicker wiz={wiz} update={update} />
        </div>
      ) : (
        <GroupPicker wiz={wiz} update={update} />
      )}
      <div className="field">
        <span className="lbl">Disciplina</span>
        {isLoading ? <Loading /> : <DisciplineTiles list={list} value={wiz.disciplineId} onChange={(id) => update({ disciplineId: id })} />}
      </div>
      {wiz.mode === "group" && (
        <>
          <div className="field">
            <span className="lbl">Forma de carga</span>
            <div className="disc" role="group" aria-label="Forma de carga">
              {way("seq", "list", "Uno por uno", "Te muestra un alumno a la vez, en el orden de la lista.")}
              {way("sheet", "sheet", "Planilla", "Toda la lista a la vista: buscás al alumno y cargás en su fila.")}
            </div>
          </div>
          <div className="field">
            <label className="lbl" htmlFor="m-date">Fecha</label>
            <input className="date-in" id="m-date" type="date" max={todayAR()} value={wiz.date} onChange={(e) => e.target.value && update({ date: e.target.value })} />
          </div>
          {anotados > 0 && <p className="draft-note">Esta planilla ya tiene {anotados} anotados sin guardar. Sigue desde ahí.</p>}
        </>
      )}
      <div className="actions sticky">
        {missing && <span className="need">{missing}</span>}
        <button className="btn pri" type="button" disabled={!!missing} onClick={() => update({ step: 3 }, false)}>Continuar</button>
      </div>
    </div>
  );
}
