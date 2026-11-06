import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Me } from "@shared/contracts";
import { ApiError, api } from "../lib/api";
import { setMe } from "../lib/hooks";
import { PageHead } from "../components/ui";

export function ChangePassword({ forced }: { forced?: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFields({});
    setError(null);
    if (next !== repeat) {
      setFields({ repeat: "Las dos contraseñas no coinciden." });
      return;
    }
    setBusy(true);
    try {
      setMe(await api.post<Me>("/api/auth/change-password", { current, next }));
      toast.success("Contraseña cambiada");
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className={`card ${forced ? "auth-card" : "narrow"}`} onSubmit={submit}>
      {forced && (
        <>
          <span className="logo"><img src="/logo.png" alt="Northfield School" width="400" height="133" /></span>
          <h1 className="auth-title">Elegí tu contraseña</h1>
          <p className="muted">Es tu primer ingreso. Cambiá la contraseña que te dieron por una que solo sepas vos.</p>
        </>
      )}
      <div className="field">
        <label className="lbl" htmlFor="pw-current">{forced ? "Contraseña que te dieron" : "Contraseña actual"}</label>
        <input className="inp" id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus={forced} />
        {fields.current && <p className="form-err">{fields.current}</p>}
      </div>
      <div className="field">
        <label className="lbl" htmlFor="pw-next">Contraseña nueva</label>
        <input className="inp" id="pw-next" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        <p className="hint">Al menos 8 caracteres.</p>
        {fields.next && <p className="form-err">{fields.next}</p>}
      </div>
      <div className="field">
        <label className="lbl" htmlFor="pw-repeat">Repetí la contraseña nueva</label>
        <input className="inp" id="pw-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        {fields.repeat && <p className="form-err">{fields.repeat}</p>}
      </div>
      {error && <p className="form-err" role="alert">{error}</p>}
      <button className="btn pri wide" type="submit" disabled={busy}>{busy ? "Guardando…" : "Cambiar contraseña"}</button>
    </form>
  );
  if (forced) return <div className="auth">{form}</div>;
  return (
    <>
      <PageHead title="Tu contraseña" />
      {form}
    </>
  );
}
