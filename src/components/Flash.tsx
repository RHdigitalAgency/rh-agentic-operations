"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export interface ToastMessage {
  tone: "ok" | "error";
  text: string;
}

/** Floating notification. Success messages fade after a few seconds; errors stay until dismissed. */
export function Toast({ message, onClose }: { message: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (message?.tone !== "ok") return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  const error = message.tone === "error";
  const Icon = error ? CircleAlert : CircleCheck;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-6">
      <div
        role={error ? "alert" : "status"}
        className={`toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg ${error ? "border-red-200" : "border-emerald-200"}`}
      >
        <Icon className={`mt-0.5 size-4 shrink-0 ${error ? "text-red-600" : "text-emerald-600"}`} aria-hidden />
        <span className={`flex-1 font-medium ${error ? "text-red-800" : "text-slate-800"}`}>{message.text}</span>
        <button type="button" onClick={onClose} className="-m-1 cursor-pointer rounded p-1 text-slate-400 hover:bg-mist hover:text-slate-600" aria-label="Dismiss">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Shows ?ok= / ?error= messages set by server actions after a redirect, then removes them from the address bar so a
 * refresh or a shared link does not repeat the message.
 */
export function Flash() {
  const params = useSearchParams();
  const error = params.get("error");
  const key = error ?? params.get("ok");
  const [seen, setSeen] = useState<string | null>(null);
  const [message, setMessage] = useState<ToastMessage | null>(null);
  // Adjust state while rendering when a new message arrives (React's recommended alternative to an effect).
  if (key !== seen) {
    setSeen(key);
    if (key) setMessage({ tone: error ? "error" : "ok", text: key });
  }
  useEffect(() => {
    if (!key) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ok");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [key]);
  const close = useCallback(() => setMessage(null), []);
  return <Toast message={message} onClose={close} />;
}
