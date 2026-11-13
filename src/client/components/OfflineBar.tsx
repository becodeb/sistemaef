// Aviso de «sin conexión» y de cargas esperando para enviarse. También dispara el envío automático.
import { useEffect, useState } from "react";
import type { Role } from "@shared/domain/roles";
import { toast } from "sonner";
import { ddmm, plural } from "../lib/format";
import { queryClient, refreshData } from "../lib/hooks";
import { discardPending, flushOutbox, prefetchForOffline, readOutbox, useOnline, useOutbox, type Pending } from "../lib/offline";
import { Confirm } from "./ui";

const marksIn = (p: Pending) => p.body.entries.length;

export function OfflineBar({ userId, role }: { userId: string; role: Role }) {
  const online = useOnline();
  const pending = useOutbox(userId);
  const [sending, setSending] = useState(false);
  const [toDiscard, setToDiscard] = useState<Pending | null>(null);

  const send = async (retryRejected = false) => {
    setSending(true);
    try {
      const sent = await flushOutbox(userId, retryRejected);
      if (sent) {
        toast.success(`Se enviaron ${plural(sent, "carga pendiente", "cargas pendientes")}`);
        void refreshData();
      }
    } finally {
      setSending(false);
    }
  };

  // Al abrir, al volver la señal y cada 20 s mientras quede algo, se intenta mandar lo pendiente.
  useEffect(() => {
    if (navigator.onLine) void prefetchForOffline(queryClient, role).catch(() => undefined);
    const run = () => {
      if (readOutbox(userId).some((p) => !p.error)) void send();
    };
    run();
    const timer = setInterval(run, 20_000);
    window.addEventListener("online", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const waiting = pending.filter((p) => !p.error);
  const rejected = pending.filter((p) => p.error);
  if (online && pending.length === 0) return null;

  return (
    <div className={`offline-bar${online ? "" : " is-off"}`} role="status">
      {!online && (
        <p>
          <b>Sin conexión.</b> Podés seguir cargando marcas: quedan guardadas en este teléfono y se envían solas cuando vuelva la señal. No cierres sesión hasta que se envíen.
        </p>
      )}
      {waiting.length > 0 && (
        <div className="offline-row">
          <p>
            <b>{plural(waiting.reduce((n, p) => n + marksIn(p), 0), "carga espera", "cargas esperan")}</b> para enviarse ({waiting.map((p) => `${p.label} · ${ddmm(p.body.takenOn)}`).join("; ")}).
          </p>
          {online && <button className="btn small" type="button" disabled={sending} onClick={() => void send()}>{sending ? "Enviando…" : "Enviar ahora"}</button>}
        </div>
      )}
      {rejected.map((p) => (
        <div className="offline-row is-err" key={p.body.batchId}>
          <p><b>No se pudo guardar {p.label} · {ddmm(p.body.takenOn)}:</b> {p.error}</p>
          <span className="row-actions">
            <button className="btn small" type="button" disabled={sending || !online} onClick={() => void send(true)}>Reintentar</button>
            <button className="btn small" type="button" onClick={() => setToDiscard(p)}>Descartar</button>
          </span>
        </div>
      ))}
      <Confirm
        open={!!toDiscard}
        title="¿Descartar esta carga?"
        action="Descartar"
        danger
        onCancel={() => setToDiscard(null)}
        onConfirm={() => {
          if (toDiscard) discardPending(userId, toDiscard.body.batchId);
          setToDiscard(null);
        }}
      >
        {toDiscard && <p>Se pierden {plural(marksIn(toDiscard), "marca", "marcas")} de {toDiscard.label}. No se puede deshacer.</p>}
      </Confirm>
    </div>
  );
}
