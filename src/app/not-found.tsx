import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md text-center">
        <h1>Page not found</h1>
        <p className="muted mt-2">The page or record does not exist, or is outside your access.</p>
        <Link href="/" className="btn btn-primary mt-4 hover:no-underline">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
