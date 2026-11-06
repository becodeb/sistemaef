// Nombres: sin mayúsculas ni tildes para comparar, así «Juan Pérez» y «juan perez» son el mismo usuario.
export function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}
export function nameKey(s: string): string {
  return fold(s).trim().replace(/\s+/g, " ");
}
export const initials = (first: string, last: string) => `${first.trim()[0] ?? ""}${last.trim()[0] ?? ""}`.toUpperCase();
export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
export const listName = (p: { firstName: string; lastName: string }) => `${p.lastName}, ${p.firstName}`;

export function matchesName(p: { firstName: string; lastName: string }, q: string, extra = ""): boolean {
  const hay = fold(`${p.firstName} ${p.lastName} ${extra}`);
  return fold(q).trim().split(/\s+/).every((w) => hay.includes(w));
}
