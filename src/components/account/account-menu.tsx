"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

export function AccountMenu({ accountName, authenticated = true }: { accountName: string; authenticated?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);

  return (
    <div className="account-menu" ref={root}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label="Open account menu" className="account-menu-trigger" onClick={() => setOpen((value) => !value)} ref={trigger} type="button">
        <Icon>person</Icon>
      </button>
      {open && <div aria-label="Account menu" className="account-menu-popover" role="menu">
        <div className="account-menu-identity"><Icon>account_circle</Icon><span><strong>{authenticated ? "Signed in" : "Preview account"}</strong><small>{accountName}</small></span></div>
        {authenticated ? <>
          <Link href="/settings" onClick={() => setOpen(false)} role="menuitem"><Icon>tune</Icon>Settings</Link>
          <Link href="/subscriptions" onClick={() => setOpen(false)} role="menuitem"><Icon>receipt_long</Icon>Subscriptions</Link>
          <form action={signOutAction}><button role="menuitem" type="submit"><Icon>logout</Icon>Sign out</button></form>
        </> : <Link href="/sign-in" onClick={() => setOpen(false)} role="menuitem"><Icon>login</Icon>Sign in</Link>}
      </div>}
    </div>
  );
}
