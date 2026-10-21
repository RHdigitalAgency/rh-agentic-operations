import type { ReactNode } from "react";

/** Client-facing documents: no app chrome, A4 print layout. Access still requires a signed-in user. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-mist py-8 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: 0 !important; max-width: none !important; }
          .avoid-break { break-inside: avoid; }
        }
      `}</style>
      {children}
    </div>
  );
}
