// Lo mínimo para que la app arranque: las disciplinas del diseño y la primera cuenta de administrador.
import { count } from "drizzle-orm";
import { nameKey } from "@shared/domain/names";
import { db } from "./client";
import { disciplines, users } from "./schema";
import { env } from "../env";
import { hashPassword } from "../lib/crypto";
import { log } from "../lib/logger";

export const BASE_DISCIPLINES: (typeof disciplines.$inferInsert)[] = [
  { name: "Velocidad 50 m", what: "Tiempo", kind: "dec", unit: "s", better: "lo", decimals: 2, lo: 5, hi: 20, example: "7,80", hint: "Tiempo del cronómetro en segundos. Por ejemplo: 7,80", icon: "vel", sort: 10 },
  { name: "Salto en largo", what: "Distancia", kind: "dec", unit: "m", better: "hi", decimals: 2, lo: 0.5, hi: 8, example: "4,20", hint: "Distancia medida desde la tabla, en metros. Por ejemplo: 4,20", icon: "largo", sort: 20 },
  { name: "Salto en alto", what: "Altura", kind: "dec", unit: "m", better: "hi", decimals: 2, lo: 0.4, hi: 2.3, example: "1,35", hint: "Altura de la varilla que superó, en metros. Por ejemplo: 1,35", icon: "alto", sort: 30 },
  { name: "Resistencia 1000 m", what: "Tiempo", kind: "ms", unit: "min", better: "lo", decimals: 0, lo: 150, hi: 1200, example: "4:35", hint: "Minutos y segundos del cronómetro. Podés escribir 4:35 o 435.", icon: "res", sort: 40 },
];

export async function ensureDisciplines() {
  const [row] = await db.select({ n: count() }).from(disciplines);
  if (row!.n === 0) await db.insert(disciplines).values(BASE_DISCIPLINES);
}

export async function ensureAdmin() {
  const [row] = await db.select({ n: count() }).from(users);
  if (row!.n > 0) return;
  if (!env.ADMIN_PASSWORD) {
    log.warn("no_admin_configured", { hint: "La base no tiene usuarios y falta ADMIN_PASSWORD: nadie puede entrar." });
    return;
  }
  await db.insert(users).values({
    username: env.ADMIN_USERNAME,
    usernameKey: nameKey(env.ADMIN_USERNAME),
    firstName: env.ADMIN_USERNAME,
    lastName: "",
    role: "admin",
    mustChangePassword: true,
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
  });
  log.info("admin_created", {});
}
