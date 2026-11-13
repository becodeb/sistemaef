import { useEffect, useRef, type ReactNode } from "react";
import type { Discipline, Student } from "@shared/contracts";
import { COURSES, GENDER_NAMES, GENDER_ONE, HOUSES, HOUSE_NAMES, LEVELS, courseLabel, type House } from "@shared/domain/school";
import { initials } from "@shared/domain/names";
import { unitName } from "@shared/domain/marks";
import { useOnline } from "../lib/offline";

const PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  rank: "M4 20h16M6 20v-6h4v6M10 20V9h4v11M14 20v-8h4v8",
  trend: "M3.500 16l5-5 4 3.500 7-7.500M15 7h4.500v4.500",
  reg: "M5 5.500a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8.500 10h7M8.500 13.500h7M8.500 17h4",
  grid: "M4 4h6.500v6.500H4zM13.500 4H20v6.500h-6.500zM4 13.500h6.500V20H4zM13.500 13.500H20V20h-6.500z",
  users: "M12.200 8a3.200 3.200 0 1 1-6.400 0 3.200 3.200 0 0 1 6.400 0zM3.500 19c.6-3 3-4.700 5.500-4.700s4.900 1.700 5.500 4.700M15.500 5.200a3 3 0 0 1 0 5.600M17.500 14.600c1.600.6 2.700 2 3 4.400",
  user: "M15.600 8a3.600 3.600 0 1 1-7.200 0 3.600 3.600 0 0 1 7.200 0zM5 20c.7-3.800 3.600-5.800 7-5.800s6.300 2 7 5.800",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  sheet: "M3.500 6a1.500 1.500 0 0 1 1.500-1.500h14A1.500 1.500 0 0 1 20.500 6v12a1.500 1.500 0 0 1-1.500 1.500H5A1.500 1.500 0 0 1 3.500 18zM3.500 9.500h17M3.500 14.500h17M9.500 4.500v15",
  search: "M17.500 11a6.500 6.500 0 1 1-13 0 6.500 6.500 0 0 1 13 0zM16 16l4 4",
  shield: "M12 3.500l7 2.500v5.500c0 4.300-3 7.600-7 9-4-1.400-7-4.700-7-9V6z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800",
  back: "M15 5l-7 7 7 7",
  alto: "M5 20V6M19 20V6M3.500 9h17M13.600 4a1.600 1.600 0 1 1-3.200 0 1.600 1.600 0 0 1 3.200 0zM9 14c1.500-2.500 4.500-2.500 6 0",
  largo: "M3 19h18M4 15c3-6 7-8 11-7M13 5.500l2.400 2.600-2.700 1.900M17 19v-2M20 19v-2",
  vel: "M19 13.500a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM12 13.500v-4M10 3.500h4M18.500 6.500L20 5",
  res: "M4 17c0-6 4-10 8-10s8 4 8 10M8 17c0-3.500 1.800-6 4-6s4 2.500 4 6M2.500 17h19",
  otra: "M12 3.500l2.600 5.300 5.900.9-4.300 4.100 1 5.900-5.200-2.800-5.200 2.800 1-5.900-4.300-4.100 5.900-.9z",
};

export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
      <path d={PATHS[name] ?? PATHS.otra} />
    </svg>
  );
}

export function Avatar({ p, lg }: { p: { firstName: string; lastName: string }; lg?: boolean }) {
  return <span className={`av${lg ? " lg" : ""}`}>{initials(p.firstName, p.lastName)}</span>;
}

const houseColor = (house: string) => `var(--h-${house})`;

export function HouseChip({ house, big }: { house: string; big?: boolean }) {
  return (
    <span className={`chip house${big ? " big" : ""}`} style={{ "--hc": houseColor(house) } as React.CSSProperties}>
      <i>{big && <Icon name="shield" />}</i>House {HOUSE_NAMES[house] ?? house}
    </span>
  );
}

export function StudentFacts({ s, label = false }: { s: Student; label?: boolean }) {
  return (
    <div className="facts">
      <span className="chip num">{label ? `Curso ${courseLabel(s.course)}` : courseLabel(s.course)}</span>
      <HouseChip house={s.house} big />
      <span className={`chip${s.gender ? "" : " undefined-gender"}`}>{s.gender ? GENDER_ONE[s.gender] : "Sexo sin definir"}</span>
    </div>
  );
}

export function PageLoading() {
  return <div className="page-loading" role="status">Cargando…</div>;
}
export function Loading() {
  // Sin señal, una consulta sin datos guardados queda en espera: se explica en vez de mostrar «Cargando…» para siempre.
  const online = useOnline();
  if (!online) return <p className="muted pad" role="status">Sin conexión: esto todavía no está guardado en este dispositivo. Se va a ver cuando vuelva la señal.</p>;
  return <p className="muted pad" role="status">Cargando…</p>;
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="notice is-err" role="alert">
      <p>{(error as Error)?.message ?? "No se pudo cargar."}</p>
      {retry && <button className="btn" type="button" onClick={retry}>Reintentar</button>}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function PageHead({ title, sub, crumb, actions }: { title: string; sub?: string; crumb?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="head">
      <div>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {sub && <p className="head-sub">{sub}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

/** Selector simple con su etiqueta visible. */
export function Pick({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="pick">
      <label className="lbl" htmlFor={id}>{label}</label>
      <select className="sel" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}
export function CourseOptions({ all }: { all?: string }) {
  return (
    <>
      {all && <option value="">{all}</option>}
      {LEVELS.map((l) => (
        <optgroup key={l.key} label={l.name}>
          {COURSES.filter((c) => c.endsWith(l.key)).map((c) => <option key={c} value={c}>{courseLabel(c)}</option>)}
        </optgroup>
      ))}
    </>
  );
}
export const HouseOptions = ({ all }: { all?: string }) => (
  <>
    {all && <option value="">{all}</option>}
    {HOUSES.map((h: House) => <option key={h} value={h}>{HOUSE_NAMES[h]}</option>)}
  </>
);
export function DisciplinePick({ id, value, onChange, list }: { id: string; value: string; onChange: (v: string) => void; list: Discipline[] }) {
  return (
    <Pick id={id} label="Disciplina" value={value} onChange={onChange}>
      {list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </Pick>
  );
}
export function GenderSeg({ value, onChange, label = "Mostrar" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const opts = [["", "Todos"], ["m", GENDER_NAMES.m!], ["h", GENDER_NAMES.h!]] as const;
  return (
    <div className="pick">
      <span className="lbl">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {opts.map(([v, t]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>
        ))}
      </div>
    </div>
  );
}
export function DisciplineTiles({ list, value, onChange }: { list: Discipline[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="disc" role="group" aria-label="Disciplina">
      {list.map((d) => (
        <button key={d.id} type="button" aria-pressed={value === d.id} onClick={() => onChange(d.id)}>
          <span className="ic"><Icon name={d.icon} /></span>
          <span><b>{d.name}</b><span>{d.what} · {unitName(d)}</span></span>
        </button>
      ))}
    </div>
  );
}

/** Confirmación propia, con el diálogo nativo del navegador. */
export function Confirm({ open, title, children, action, danger, onCancel, onConfirm, busy }: { open: boolean; title: string; children?: ReactNode; action: string; danger?: boolean; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onCancel={onCancel}>
      <h2>{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="actions">
        <button className="btn" type="button" onClick={onCancel}>Cancelar</button>
        <button className={`btn ${danger ? "danger" : "pri"}`} type="button" disabled={busy} onClick={onConfirm}>{action}</button>
      </div>
    </dialog>
  );
}
