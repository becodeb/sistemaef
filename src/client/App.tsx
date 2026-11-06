import { Navigate, Route, Routes } from "react-router-dom";
import { isAdmin, isSuper } from "@shared/domain/roles";
import { Shell } from "./components/Shell";
import { PageLoading } from "./components/ui";
import { useMe } from "./lib/hooks";
import { Alumnos } from "./pages/admin/Alumnos";
import { DisciplinasAdmin } from "./pages/admin/DisciplinasAdmin";
import { Usuarios } from "./pages/admin/Usuarios";
import { ChangePassword } from "./pages/ChangePassword";
import { Disciplinas } from "./pages/Disciplinas";
import { Estudiantes } from "./pages/Estudiantes";
import { Inicio } from "./pages/Inicio";
import { Login } from "./pages/Login";
import { NuevoRegistro } from "./pages/nuevo/NuevoRegistro";
import { Perfil } from "./pages/Perfil";
import { Progreso } from "./pages/Progreso";
import { Rankings } from "./pages/Rankings";
import { Registros } from "./pages/Registros";

export function App() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <PageLoading />;
  if (!me) return <Login />;
  if (me.mustChangePassword) return <ChangePassword forced />;
  const admin = isAdmin(me.role);
  return (
    <Shell me={me}>
      <Routes>
        <Route path="/" element={admin ? <Inicio /> : <Navigate to="/registros" replace />} />
        <Route path="/estudiantes" element={<Estudiantes />} />
        <Route path="/estudiantes/:id" element={<Perfil />} />
        <Route path="/registros" element={<Registros />} />
        <Route path="/registros/nuevo" element={<NuevoRegistro />} />
        <Route path="/cuenta" element={<ChangePassword />} />
        {admin && <Route path="/disciplinas" element={<Disciplinas />} />}
        {admin && <Route path="/rankings" element={<Rankings />} />}
        {admin && <Route path="/progreso" element={<Progreso />} />}
        {admin && <Route path="/admin/alumnos" element={<Alumnos />} />}
        {admin && <Route path="/admin/disciplinas" element={<DisciplinasAdmin />} />}
        {isSuper(me.role) && <Route path="/admin/usuarios" element={<Usuarios />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
