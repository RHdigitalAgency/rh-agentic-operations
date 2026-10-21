export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="h-24 rounded bg-slate-100" />
      <div className="h-48 rounded bg-slate-100" />
    </div>
  );
}
