export type SortValue = string | number | Date | null | undefined;
export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

/**
 * Sorts list rows by a whitelisted column (`?sort=<key>&dir=asc|desc`). Unknown keys keep the server order;
 * empty values always go last.
 */
export function sortRows<T>(rows: T[], accessors: SortAccessors<T>, key: string | undefined, dir: string | undefined): T[] {
  const get = key ? accessors[key] : undefined;
  if (!get) return rows;
  const sign = dir === "desc" ? -1 : 1;
  const norm = (v: SortValue) => (v instanceof Date ? v.getTime() : typeof v === "string" ? v.toLowerCase() : v);
  return [...rows].sort((a, b) => {
    const x = norm(get(a));
    const y = norm(get(b));
    const xEmpty = x === null || x === undefined || x === "";
    const yEmpty = y === null || y === undefined || y === "";
    if (xEmpty || yEmpty) return xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y), "en", { numeric: true }) * sign;
  });
}
