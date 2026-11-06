import { useState, type FormEvent } from "react";
import type { Me } from "@shared/contracts";
import { ApiError, api } from "../lib/api";
import { setMe } from "../lib/hooks";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(await api.post<Me>("/api/auth/login", { username, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo entrar. Probá de nuevo.");
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <span className="logo"><img src="/logo.png" alt="Northfield School" width="400" height="133" /></span>
        <div className="brand"><b>RÉCORD</b><span>Rendimiento deportivo escolar</span></div>
        <div className="field">
          <label className="lbl" htmlFor="username">Usuario</label>
          <input className="inp" id="username" autoComplete="username" autoCapitalize="words" placeholder="Tu nombre y apellido" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="password">Contraseña</label>
          <input className="inp" id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="form-err" role="alert">{error}</p>}
        <button className="btn pri wide" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <p className="hint">¿No tenés usuario o te olvidaste la contraseña? Pedíselo a un administrador.</p>
      </form>
    </div>
  );
}
