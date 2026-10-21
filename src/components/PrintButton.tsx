"use client";

import { Printer } from "lucide-react";

/** Opens the browser print dialog; choose "Save as PDF" to produce the client document. */
export function PrintButton({ label = "Save as PDF / Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary">
      <Printer className="size-4" aria-hidden /> {label}
    </button>
  );
}
