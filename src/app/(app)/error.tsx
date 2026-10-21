"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const notFound = /not found/i.test(error.message);
  const forbidden = /permission/i.test(error.message);
  return (
    <div className="card mx-auto mt-8 max-w-lg text-center">
      <h1>{notFound ? "Not found" : forbidden ? "Access denied" : "Something went wrong"}</h1>
      <p className="muted mt-2">
        {notFound || forbidden
          ? "This record does not exist or is outside your access."
          : "The page could not be loaded. Your data is safe — try again, or go back to the dashboard."}
      </p>
      {error.digest ? <p className="mt-2 text-xs text-slate-400">Reference: {error.digest}</p> : null}
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn" onClick={reset}>
          Try again
        </button>
        <Link className="btn btn-primary hover:no-underline" href="/">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
