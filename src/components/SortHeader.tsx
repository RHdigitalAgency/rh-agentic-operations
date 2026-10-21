import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/** Clickable column header: first click sorts ascending (descending for numbers/dates via `firstDir`), next click flips. */
export function SortHeader({ label, field, params, path, align = "left", firstDir = "asc" }: {
  label: string; field: string; params: Record<string, string | undefined>; path: string; align?: "left" | "right"; firstDir?: "asc" | "desc";
}) {
  const active = params.sort === field;
  const dir = active ? (params.dir === "desc" ? "asc" : "desc") : firstDir;
  const q = new URLSearchParams(Object.entries({ ...params, sort: field, dir }).filter(([k, v]) => v && k !== "ok" && k !== "error") as [string, string][]);
  const Icon = !active ? ArrowUpDown : params.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th className={align === "right" ? "text-right" : undefined} aria-sort={active ? (params.dir === "desc" ? "descending" : "ascending") : undefined}>
      <Link href={`${path}?${q}`} className={`inline-flex items-center gap-1 text-inherit hover:text-navy hover:no-underline ${active ? "text-navy" : ""}`}>
        {label}
        <Icon className={`size-3 ${active ? "text-rh" : "text-slate-300"}`} aria-hidden />
      </Link>
    </th>
  );
}

/** CSV download button for list pages (export permission only). */
export function ExportLink({ kind }: { kind: string }) {
  return <a className="btn hover:no-underline" href={`/api/exports/${kind}`} download>Export CSV</a>;
}
