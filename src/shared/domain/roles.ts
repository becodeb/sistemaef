// Quién puede hacer qué. El servidor lo hace cumplir; el cliente lo usa para no mostrar lo que no corresponde.
export const ROLES = ["teacher", "admin", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAMES: Record<Role, string> = { teacher: "Docente", admin: "Admin", superadmin: "Admin general" };

/** Docente: todos los cursos, pero solo carga marcas y ve alumnos. Admin en adelante: todo lo demás. */
export const isAdmin = (role: Role) => role === "admin" || role === "superadmin";
/** Crear usuarios y dar accesos queda para el admin general (los desarrolladores). */
export const isSuper = (role: Role) => role === "superadmin";
