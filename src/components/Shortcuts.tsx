"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Keyboard shortcuts: N = new lead, / = search. Ignored while typing in a field or with modifier keys. */
export function Shortcuts({ canCreateLead }: { canCreateLead: boolean }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "/") {
        const search = document.getElementById("global-search");
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if ((e.key === "n" || e.key === "N") && canCreateLead) {
        e.preventDefault();
        router.push("/leads/new");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, canCreateLead]);
  return null;
}
