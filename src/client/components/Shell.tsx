import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import type { Me } from "@shared/contracts";
import { initials } from "@shared/domain/names";
import { ROLE_NAMES, isAdmin, isSuper } from "@shared/domain/roles";
import { api } from "../lib/api";
import { queryClient, setMe } from "../lib/hooks";
import { Icon } from "./ui";

// Docente: solo cargar marcas y ver alumnos. El resto aparece desde admin en adelante.
const NAV = [
  ["/", "Inicio", "home", true],
  ["/estudiantes", "Estudiantes", "users", false],
  ["/disciplinas", "Disciplinas", "grid", true],
  ["/rankings", "Rankings", "rank", true],
  ["/progreso", "Progreso", "trend", true],
  ["/registros", "Registros", "reg", false],
] as const;

export function Shell({ me, children }: { me: Me; children: ReactNode }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const admin = isAdmin(me.role);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  const logout = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    queryClient.clear();
    setMe(null);
    nav("/");
  };
  const links = (
    <>
      <button className="btn-new" type="button" onClick={() => nav("/registros")}>
        <Icon name="plus" />Nuevo registro
      </button>
      <nav className="nav" aria-label="Principal">
        {NAV.filter(([, , , adminOnly]) => !adminOnly || admin).map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
            <Icon name={icon} />{label}
          </NavLink>
        ))}
      </nav>
      {admin && (
        <nav className="nav admin-nav" aria-label="Administración">
          <span className="nav-title">Administración</span>
          {isSuper(me.role) && (
            <NavLink to="/admin/usuarios" className={({ isActive }) => (isActive ? "on" : "")}><Icon name="shield" />Usuarios y accesos</NavLink>
          )}
          <NavLink to="/admin/alumnos" className={({ isActive }) => (isActive ? "on" : "")}><Icon name="list" />Alumnos</NavLink>
          <NavLink to="/admin/disciplinas" className={({ isActive }) => (isActive ? "on" : "")}><Icon name="gear" />Disciplinas</NavLink>
        </nav>
      )}
    </>
  );
  const account = (
    <div className="me">
      <span className="av">{initials(me.firstName, me.lastName)}</span>
      <div className="me-text">
        <b>{me.username}</b>
        <span>{ROLE_NAMES[me.role]}</span>
        <span className="me-links">
          <Link to="/cuenta">Contraseña</Link> · <button type="button" className="linklike" onClick={logout}>Salir</button>
        </span>
      </div>
    </div>
  );

  return (
    <div className="app">
      <aside className="side" aria-label="Menú">
        <span className="logo"><img src="/logo.png" alt="Northfield School" width="400" height="133" /></span>
        <div className="brand"><b>RÉCORD</b><span>Rendimiento deportivo escolar</span></div>
        {links}
        {account}
      </aside>
      <div className="content">
        <header className="topbar">
          <span className="logo"><img src="/logo.png" alt="Northfield School" width="400" height="133" /></span>
          <span className="t"><b>RÉCORD</b></span>
          <button className="menu-btn" type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{menu ? "Cerrar" : "Menú"}</button>
        </header>
        {menu && <div className="mobile-menu">{links}{account}</div>}
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
