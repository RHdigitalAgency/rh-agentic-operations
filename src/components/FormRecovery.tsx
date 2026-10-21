"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

type Snapshot = { key: string; entries: [string, string][] };
let lastSubmit: Snapshot | null = null;

/**
 * Server-action forms. After hydration React drops the hidden $ACTION_ID input and sets a javascript: action URL, so
 * both shapes are recognized.
 */
const isActionForm = (f: HTMLFormElement) =>
  (f.getAttribute("action") ?? "").startsWith("javascript:") || [...f.elements].some((e) => (e as HTMLInputElement).name?.startsWith("$ACTION"));
const signature = (f: HTMLFormElement) =>
  `${(f.elements.namedItem("id") as HTMLInputElement | null)?.value ?? ""}|${[...new Set([...f.elements].map((e) => (e as HTMLInputElement).name).filter((n) => n && !n.startsWith("$")))].join(",")}`;

/** Identifies a form across the re-render: record id + field names, and its position among identical forms. */
function formKey(form: HTMLFormElement): string {
  const base = signature(form);
  const twins = [...document.forms].filter((f) => signature(f) === base);
  return `${base}|${twins.indexOf(form)}`;
}

function restore(snapshot: Snapshot) {
  const form = [...document.forms].find((f) => formKey(f) === snapshot.key);
  if (!form) return;
  const byName = new Map<string, string[]>();
  for (const [k, v] of snapshot.entries) byName.set(k, [...(byName.get(k) ?? []), v]);
  for (const el of [...form.elements] as HTMLInputElement[]) {
    if (!el.name || el.name.startsWith("$ACTION") || ["hidden", "file", "submit", "button"].includes(el.type)) continue;
    const values = byName.get(el.name) ?? [];
    if (el.type === "checkbox" || el.type === "radio") el.checked = values.includes(el.value);
    else if (values.length) el.value = values[0];
  }
}

/**
 * When a server action fails validation, the page re-renders with ?error= and the submitted form comes back with its
 * saved values — wiping what the user typed. This puts the submitted values back into that form so the user only
 * corrects the problem. Successful actions are unaffected (their forms show the freshly saved values).
 */
export function FormRecovery() {
  const error = useSearchParams().get("error");

  useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !isActionForm(form)) return;
      const entries = [...new FormData(form).entries()].filter((x): x is [string, string] => typeof x[1] === "string");
      lastSubmit = { key: formKey(form), entries };
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    const snapshot = lastSubmit;
    lastSubmit = null;
    if (!error || !snapshot) return;
    // The re-rendered page is committed by now. Not cancelled on cleanup: Flash strips ?error= from the URL right
    // away, which re-runs this effect before a deferred callback would fire. The second pass covers a late reset.
    restore(snapshot);
    requestAnimationFrame(() => restore(snapshot));
  }, [error]);

  return null;
}
