export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function readParams(sp: SearchParams): Promise<Record<string, string | undefined>> {
  const raw = await sp;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined]));
}
