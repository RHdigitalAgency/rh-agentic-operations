"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/** Sidebar frame: always open on desktop; on phones a menu button toggles it and it closes after navigating. */
export function SidebarShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setOpen(false);
  }
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 md:block md:px-5 md:pt-5 md:pb-4">
        {brand}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-white/80 hover:bg-white/10 md:hidden"
          aria-expanded={open}
          aria-controls="main-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </div>
      <div id="main-menu" className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-4rem)] flex-col overflow-y-auto md:flex md:max-h-none md:min-h-0 md:flex-1 md:overflow-visible`}>
        {children}
      </div>
    </>
  );
}
