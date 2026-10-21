"use client";

import { useSearchParams } from "next/navigation";

/** Shows ?ok= / ?error= messages set by server actions after a redirect. */
export function Flash() {
  const params = useSearchParams();
  const error = params.get("error");
  const ok = params.get("ok");
  if (!error && !ok) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {error ?? ok}
    </div>
  );
}
