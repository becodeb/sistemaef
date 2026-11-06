# RÉCORD

Leé `docs/ARQUITECTURA.md` antes de tocar código: stack, roles, reglas del dominio y cuidado de los datos de menores.

- Dev: `npm run dev` (API en :3000 vía `API_PORT`, web en :5173). Postgres local: contenedor `record-pg` (:54391).
- Tests: `npm test`. Typecheck: `npm run typecheck`. Migraciones: editar `src/server/db/schema.ts` y `npm run db:generate`.
- Nunca commitear listas reales de alumnos: van en `private/`, que está ignorada.
- Textos en castellano rioplatense, con voseo. Mobile first.
