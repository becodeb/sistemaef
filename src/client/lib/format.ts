/** 2026-11-06 pasa a 06/11. */
export function ddmm(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
export function ddmmyyyy(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** 2026-03 pasa a mar. */
export const monthLabel = (month: string) => MONTHS[Number(month.split("-")[1]) - 1] ?? month;
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
