import { useState } from "react";
import { toast } from "sonner";
import type { PromotionDone, PromotionStatus } from "@shared/contracts";
import { GRAD, courseLabel } from "@shared/domain/school";
import { Confirm, ErrorBox, Icon, Loading } from "../../components/ui";
import { api } from "../../lib/api";
import { ddmmyyyy, plural } from "../../lib/format";
import { refreshData, useApi } from "../../lib/hooks";

/** Fin de año: todos suben un curso y los de 6.º de secundaria quedan en GRAD TEAM. */
export function PasoDeAnio() {
  const { data, isLoading, error, refetch } = useApi<PromotionStatus>("/api/admin/promotion");
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<"promote" | "undo" | null>(null);
  const [busy, setBusy] = useState(false);

  const total = data?.steps.reduce((a, s) => a + s.students, 0) ?? 0;
  const leaving = data?.steps.find((s) => s.to === GRAD)?.students ?? 0;
  const last = data?.last;

  const run = async () => {
    setBusy(true);
    try {
      if (asking === "promote") {
        const res = await api.post<PromotionDone>("/api/admin/promotion");
        toast.success(`Listo: ${plural(res.moved, "alumno pasó", "alumnos pasaron")} de año (${res.graduated} a GRAD TEAM)`);
        setOpen(false);
      } else if (last) {
        const res = await api.post<{ restored: number; skipped: number }>(`/api/admin/promotion/${last.id}/undo`);
        toast.success(`Se deshizo: ${plural(res.restored, "alumno volvió", "alumnos volvieron")} a su curso${res.skipped ? `. ${res.skipped} no: les cambiaron el curso después` : ""}`);
      }
      setAsking(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      void refreshData();
    }
  };

  return (
    <div className="card">
      <h2>Paso de año</h2>
      <p className="sub">Sube un curso a todos los alumnos de una vez. Los de 6.º de secundaria pasan a GRAD TEAM: conservan su perfil y sus récords, y ya no se les cargan marcas.</p>
      {isLoading && <Loading />}
      {error && !data && <ErrorBox error={error} retry={() => void refetch()} />}
      {last && (
        <div className="promo-last">
          <span>Último paso de año: <b className="num">{ddmmyyyy(last.on)}</b>, {last.byName}. {plural(last.moved, "alumno", "alumnos")} ({last.graduated} a GRAD TEAM).</span>
          {last.canUndo && <button className="btn small" type="button" disabled={busy} onClick={() => setAsking("undo")}>Deshacer</button>}
        </div>
      )}
      {data && !data.ready && <p className="muted small">Se puede volver a hacer cuando termine el próximo año.</p>}
      {data?.ready && !open && <div className="actions"><button className="btn" type="button" disabled={total === 0} onClick={() => setOpen(true)}>Preparar el paso de año</button></div>}
      {data?.ready && open && (
        <div className="preview">
          <h3>Esto va a pasar</h3>
          <ul className="promo">
            {data.steps.map((s) => (
              <li key={s.from} className={s.to === GRAD ? "is-grad" : undefined}>
                <span className="num nowrap">{courseLabel(s.from)}</span>
                <Icon name="back" size={14} />
                <b className="num nowrap">{courseLabel(s.to)}</b>
                <span className="muted num">{s.students}</span>
              </li>
            ))}
          </ul>
          <ul className="small preview-list">
            <li>1.º EP queda vacío: los nuevos se agregan después importando la lista.</li>
            <li>Si alguien repite, cambiale el curso en la lista de alumnos después del paso.</li>
            <li>Las marcas viejas conservan el curso en que se tomaron. Los dados de baja no cambian.</li>
            <li>Se puede deshacer durante 30 días.</li>
          </ul>
          <div className="actions">
            <button className="btn" type="button" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn pri" type="button" disabled={busy || total === 0} onClick={() => setAsking("promote")}>Pasar de año a {total}</button>
          </div>
        </div>
      )}
      <Confirm open={asking === "promote"} title={`¿Pasar de año a ${plural(total, "alumno", "alumnos")}?`} action="Pasar de año" busy={busy} onCancel={() => setAsking(null)} onConfirm={() => void run()}>
        <p>Todos suben un curso y {leaving === 1 ? "1 alumno pasa" : `${leaving} alumnos pasan`} a GRAD TEAM. Cambia para todos los profes en el momento. Se puede deshacer durante 30 días.</p>
      </Confirm>
      <Confirm open={asking === "undo"} title="¿Deshacer el paso de año?" action="Deshacer" danger busy={busy} onCancel={() => setAsking(null)} onConfirm={() => void run()}>
        {last && <p>{last.moved === 1 ? "El alumno vuelve" : `Los ${last.moved} alumnos vuelven`} al curso que tenían antes del {ddmmyyyy(last.on)}, incluidos los de GRAD TEAM. Quienes hayan cambiado de curso a mano después quedan como están.</p>}
      </Confirm>
    </div>
  );
}
