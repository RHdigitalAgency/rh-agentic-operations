import type { SearchParams } from "@/lib/params";
import { readParams } from "@/lib/params";

/** Public page clients land on after Stripe Checkout. Shows no business data. */
export default async function PaidPage({ searchParams }: { searchParams: SearchParams }) {
  const { cancelled } = await readParams(searchParams);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md text-center">
        <div className="text-xs font-semibold tracking-widest text-brand-700 uppercase">RH Digital Agency</div>
        <h1 className="mt-2">{cancelled ? "Payment not completed" : "Payment received — thank you"}</h1>
        <p className="muted mt-2">
          {cancelled
            ? "No charge was made. You can reopen the payment link we sent you whenever you're ready."
            : "Your Agentic Operations Audit is confirmed. Our team will contact you shortly to schedule discovery."}
        </p>
      </div>
    </main>
  );
}
