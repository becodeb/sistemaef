# RÉCORD — Arquitectura y convenciones

App web para tomar y seguir las marcas deportivas de Northfield School. Es de uso interno: los chicos no tienen acceso.

## Stack

| Capa | Elección |
|---|---|
| Cliente | React 19 + Vite + React Router + TanStack Query, CSS propio (`src/client/styles.css`) |
| Servidor | Node 22 + Hono 4 (`src/server`); un solo proceso sirve la API y el cliente compilado |
| Base de datos | PostgreSQL 17 + Drizzle ORM (`src/server/db/schema.ts`, migraciones SQL en `drizzle/`) |
| Deploy | Un contenedor (`Dockerfile`) y una base Postgres, ambos en Coolify. Las migraciones corren al arrancar |

Corre como **una sola instancia**: el límite de intentos de login vive en memoria.

## Estructura

```
src/
  shared/domain/     Reglas puras, testeadas, que usan los dos lados:
                     marks (validar y formatear marcas), school (cursos, houses), roles,
                     roster-import (leer la lista de alumnos), names
  shared/contracts.ts  Esquemas zod de los pedidos y tipos de las respuestas
  server/
    auth.ts          Sesión (cookie httpOnly rec_s, token hasheado) y requireUser/requireAdmin/requireSuper
    routes/          auth, students (+ roster), marks, stats, admin
    services/        marks (guardar, historial, marcas personales), stats (rankings, progreso), audit
    db/              schema, migrate, bootstrap (disciplinas base y primera cuenta)
  client/
    pages/           Una pantalla por archivo; nuevo/ tiene los pasos de carga y admin/ la administración
    components/      Shell, ui, LineChart
    lib/             api, hooks, drafts (borrador local de la planilla)
```

## Roles

Lo hace cumplir el servidor en cada ruta; el cliente solo esconde lo que no corresponde.

| | Docente | Admin | Admin general |
|---|---|---|---|
| Ver todos los alumnos y cursos | ✓ | ✓ | ✓ |
| Cargar marcas | ✓ | ✓ | ✓ |
| Inicio, Disciplinas, Rankings, Progreso | | ✓ | ✓ |
| Borrar cargas, poner metas | | ✓ | ✓ |
| Modificar alumnos, houses, importar, disciplinas | | ✓ | ✓ |
| Crear usuarios de cualquier rol y dar o sacar accesos | | | ✓ |

El admin general es para los desarrolladores. La primera cuenta se crea con `ADMIN_USERNAME` y `ADMIN_PASSWORD` si la base no
tiene usuarios. Tiene que quedar siempre al menos un admin general con acceso.

## Reglas del dominio

- **Curso** = año + nivel, sin división: `6ES`, `3EP` (`shared/domain/school.ts`). K5 no está incluido. **Equipos** = houses: Earth, Wind, Water.
- **Sexo**: `m` (mujer), `h` (hombre) o `null`. Quien tiene `null` aparece en «Todos» pero no en las listas separadas.
- **Marcas**: un alumno puede tener todas las que se quieran. `value` null es ausente; los tiempos largos van en segundos.
- `courseAt` guarda el curso del alumno al tomar la marca: pasar de año o cambiar de curso no altera los rankings viejos.
- `isPb` y `pbDelta` (marca personal) se **recalculan desde el historial** al guardar y al borrar, porque se puede cargar una fecha vieja.
- `batchId` identifica cada envío y es único con el alumno: si el teléfono reintenta por mala señal, no se duplica nada.
- La planilla sin guardar vive en `localStorage` (`client/lib/drafts.ts`), por dispositivo y usuario: la cancha puede no tener señal.

## Sin señal

La app se instala en el teléfono (`public/manifest.json`) y abre sin conexión. El servidor sigue siendo la única fuente
compartida: lo que carga un profe lo ven todos apenas llega.

- `public/sw.js` guarda **solo la app**, nunca la API. Páginas: primero la red y, sin señal, la app guardada. `/assets/*`:
  lo guardado, porque el nombre trae el hash. `scripts/stamp-sw.mjs` le pone una versión nueva en cada build, así los
  teléfonos se actualizan y borran la anterior.
- `client/lib/offline.ts` guarda en `localStorage` todo lo que se vio (si no entra, lo esencial para cargar) y lo
  restaura al abrir. Se guarda aunque el último pedido haya fallado por falta de señal, y también al cerrar o
  minimizar la app. Al abrir con señal, `prefetchForOffline` trae la vista inicial de cada pantalla según el rol.
  Al cerrar sesión se borra todo.
- Las pantallas muestran el error solo si no tienen nada guardado (`error && !data`). Sin señal y sin datos, `Loading`
  explica que eso todavía no está guardado; un perfil nunca abierto muestra al alumno y deja cargarle una marca.
- Para probar las pantallas sin conexión: `walk.mjs` (Playwright) recorre cada una como docente y admin, en modo avión
  y con wifi sin internet (servidor que no responde).
- Sin la lista de un grupo guardada, se arma desde la lista completa de alumnos (`rosterFromStudents`), sin mejores marcas.
- **Cola de envíos**: si guardar falla por falta de conexión (o 502/503/504), la carga queda en `record:outbox:<usuario>`
  y se manda sola al volver la señal, al abrir la app o cada 20 s. Cada carga conserva su `batchId`, así que reintentar
  nunca duplica. Si el servidor la rechaza (por ejemplo, un alumno dado de baja), queda marcada con el motivo para
  reintentar o descartar. La cola sobrevive al cierre de sesión y se envía cuando ese usuario vuelve a entrar.
- Las marcas solo se suman, nunca se pisan: dos profes sin señal no generan conflictos, y la marca personal se recalcula
  en el servidor con todo el historial.
- Para probarlo: el navegador integrado del editor no soporta service workers; usar Chrome o Playwright con `setOffline`.

## Datos de menores

- Las listas reales **nunca van al repo**: `private/` y `*.xlsx` están ignorados. Se importan desde Administración → Alumnos.
- El seed de desarrollo se niega a correr contra una base que no sea local.
- `logger`: solo ids y conteos, nunca nombres ni marcas. `audit_logs` registra quién borró qué y quién cambió accesos.
- Sin indexar (`noindex`), cookies `Secure`/`httpOnly`, CSP estricta, control de origen en toda mutación, contraseñas con scrypt.

## Convenciones

- Toda ruta valida con `readJson(c, esquemaZod)`; los errores son `HttpError` con mensaje en castellano rioplatense, accionable.
- Nada de datos falsos en producción ni botones decorativos: lo que no funciona no se muestra.
- Mobile first: los profes cargan desde el teléfono en la cancha. Áreas táctiles de 44 px y nada que dependa de hover.

## Idea a futuro: varios colegios (no implementado)

Hoy hay un solo colegio y el modelo no tiene el concepto. Para sumar más, sin reescribir:

1. Tabla `schools` y columna `school_id` en `users`, `students`, `disciplines` (y por herencia `marks`, `goals`, `audit_logs`).
2. Mover lo que hoy es constante a datos de cada colegio: cursos, niveles y houses (`shared/domain/school.ts`) y el logo y el nombre (`Shell`).
3. Filtrar **todas** las consultas por el colegio del usuario en un único punto (como `requireUser`), para que no se pueda
   olvidar en una ruta. Un recurso de otro colegio responde 404.
4. El admin general pasa a ser global, con selector de colegio; docente y admin quedan atados a uno.
5. Unicidad por colegio: `username_key` y `disciplines.name` hoy son únicos globales.

Lo que ya ayuda: las reglas puras no dependen de la base, los roles están centralizados y todo acceso a datos pasa por `services/` y `routes/`.
