# RÉCORD

Registro de marcas deportivas de Northfield School: carga individual o de todo un curso o house, perfil de cada alumno,
rankings y progreso. Detalles en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Desarrollo

```bash
docker run -d --name record-pg -p 127.0.0.1:54391:5432 -e POSTGRES_USER=record -e POSTGRES_PASSWORD=record_dev_pw -e POSTGRES_DB=record postgres:17
docker exec record-pg psql -U record -d record -c "create database record_test"
cp .env.example .env
npm ci
npm run dev
```

La app queda en http://localhost:5173. Primer ingreso: `Admin General` con la contraseña de `ADMIN_PASSWORD`.

`npm run db:seed-dev` carga usuarios y marcas de prueba en la base local.

## Comandos

- `npm test`: unitarios e integración contra `record_test`
- `npm run typecheck`
- `npm run db:generate`: genera la migración después de cambiar `src/server/db/schema.ts`
- `npm run build` y `npm start`: compilado de producción

## Variables de producción

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres |
| `PUBLIC_URL` | Origen público, con https |
| `TRUST_PROXY` | `true` detrás de Traefik y Cloudflare |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Primera cuenta (admin general), solo si la base no tiene usuarios |

Las listas de alumnos no van al repo: se importan desde Administración → Alumnos.
