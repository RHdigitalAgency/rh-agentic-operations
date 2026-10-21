"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Submit button that disables itself while the server action runs (prevents double submits). */
export function SubmitButton({ children, className = "btn btn-primary", name, value, confirm }: { children: ReactNode; className?: string; name?: string; value?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={className}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
