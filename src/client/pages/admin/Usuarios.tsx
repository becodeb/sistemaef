import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { UserCreated, UserRow } from "@shared/contracts";
import { ROLES, ROLE_NAMES, type Role } from "@shared/domain/roles";
import { Confirm, ErrorBox, Loading, PageHead } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { useApi, useMe } from "../../lib/hooks";

function PasswordNotice({ created, onClose }: { created: UserCreated; onClose: () => void }) {
  const text = `Usuario: ${created.user.username}\nContraseña inicial: ${created.password}`;
  return (
    <div className="notice is-ok" role="status">
      <div>
        <p><b>Pasale estos datos a {created.user.firstName}.</b> La contraseña se muestra una sola vez, y al entrar tiene que cambiarla.</p>
        <p className="cred num">Usuario: <b>{created.user.username}</b><br />Contraseña inicial: <b>{created.password}</b></p>
      </div>
      <div className="notice-actions">
        <button className="btn" type="button" onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar. Seleccioná el texto."))}>Copiar</button>
        <button className="btn" type="button" onClick={onClose}>Listo</button>
      </div>
    </div>
  );
}

export function Usuarios() {
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useApi<UserRow[]>("/api/admin/users");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<UserCreated | null>(null);
  const [toReset, setToReset] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setFormError(null);
    try {
      const res = await api.post<UserCreated>("/api/admin/users", { firstName, lastName, role, password: password || undefined });
      setCreated(res);
      setFirstName("");
      setLastName("");
      setPassword("");
      setRole("teacher");
      void refetch();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const patch = async (u: UserRow, body: { active?: boolean; role?: Role }) => {
    try {
      await api.patch(`/api/admin/users/${u.id}`, body);
      void refetch();
    } catch (err) {
      toast.error((err as Error).message);
      void refetch();
    }
  };
  const reset = async () => {
    if (!toReset) return;
    try {
      setCreated(await api.post<UserCreated>(`/api/admin/users/${toReset.id}/reset-password`));
      setToReset(null);
      void refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Usuarios y accesos" sub="Quién puede entrar a RÉCORD y qué puede hacer." />
      {created && <PasswordNotice created={created} onClose={() => setCreated(null)} />}
      <div className="card">
        <h2>Nuevo usuario</h2>
        <p className="sub">El usuario es su nombre y apellido. La contraseña se la ponés vos y la cambia al entrar por primera vez.</p>
        <form className="form-grid" onSubmit={create}>
          <div>
            <label className="lbl" htmlFor="u-first">Nombre</label>
            <input className="inp" id="u-first" autoComplete="off" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            {fields.firstName && <p className="form-err">{fields.firstName}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="u-last">Apellido</label>
            <input className="inp" id="u-last" autoComplete="off" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            {fields.lastName && <p className="form-err">{fields.lastName}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="u-pass">Contraseña inicial</label>
            <input className="inp" id="u-pass" autoComplete="new-password" placeholder="Vacía: se genera sola" value={password} onChange={(e) => setPassword(e.target.value)} />
            {fields.password && <p className="form-err">{fields.password}</p>}
          </div>
          <div>
            <label className="lbl" htmlFor="u-role">Rol</label>
            <select className="sel" id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
            </select>
          </div>
          <div className="form-end"><button className="btn pri" type="submit" disabled={busy}>Crear usuario</button></div>
        </form>
        {formError && <p className="form-err" role="alert">{formError}</p>}
        <ul className="role-help muted small">
          <li><b>Docente:</b> ve todos los cursos, carga marcas y ve a los alumnos.</li>
          <li><b>Admin:</b> además ve las estadísticas, borra cargas y modifica alumnos, houses y disciplinas.</li>
          <li><b>Admin general:</b> además crea usuarios de cualquier rol y maneja los accesos.</li>
        </ul>
      </div>
      <div className="card">
        <h2>Usuarios</h2>
        {isLoading && <Loading />}
        {error && <ErrorBox error={error} retry={() => void refetch()} />}
        {data && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th /></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className={u.active ? "" : "row-off"}>
                    <td>{u.username}{u.id === me?.id && <span className="muted small"> (vos)</span>}</td>
                    <td>
                      <select className="sel small" aria-label={`Rol de ${u.username}`} value={u.role} onChange={(e) => void patch(u, { role: e.target.value as Role })}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                      </select>
                    </td>
                    <td>{!u.active ? <span className="st-chip s-abs">Sin acceso</span> : u.mustChangePassword ? <span className="st-chip s-warn">Debe cambiar la contraseña</span> : <span className="st-chip s-ok">Con acceso</span>}</td>
                    <td className="muted num nowrap">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("es-AR") : "Nunca"}</td>
                    <td className="row-actions">
                      <button className="btn small" type="button" onClick={() => setToReset(u)}>Nueva contraseña</button>
                      <button className="btn small" type="button" onClick={() => void patch(u, { active: !u.active })}>{u.active ? "Sacar acceso" : "Dar acceso"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Confirm open={!!toReset} title="¿Generar una contraseña nueva?" action="Generar" onCancel={() => setToReset(null)} onConfirm={() => void reset()}>
        {toReset && <p>{toReset.username} no va a poder entrar con la anterior, se le cierra la sesión y va a tener que cambiar la nueva al entrar.</p>}
      </Confirm>
    </>
  );
}
