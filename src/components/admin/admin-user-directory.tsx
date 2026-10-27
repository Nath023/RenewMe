"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { changeAdminAccountStatus, loadAdminAccounts } from "@/app/actions/admin";
import type { AdminAccount } from "@/lib/admin/accounts";

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function AdminUserDirectory({ initialAccounts, initialError, initialPage, initialHasMore, initialTotalCount }: { initialAccounts: AdminAccount[]; initialError: string | null; initialPage: number; initialHasMore: boolean; initialTotalCount: number }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryRef = useRef(query);
  const lastLoadedSearch = useRef("");
  queryRef.current = query;

  useEffect(() => {
    const search = query.trim().slice(0, 200);
    if (search === lastLoadedSearch.current) return;
    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        setError(null);
        const result = await loadAdminAccounts(search, 1);
        if (queryRef.current.trim().slice(0, 200) !== search) return;
        if (result.error) { setError(result.error); return; }
        lastLoadedSearch.current = search;
        setAccounts(result.accounts);
        setPage(result.page);
        setHasMore(result.hasMore);
        setTotalCount(result.totalCount);
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query, startTransition]);

  function changePage(nextPage: number) {
    startTransition(async () => {
      setError(null);
      const result = await loadAdminAccounts(queryRef.current.trim().slice(0, 200), nextPage);
      if (result.error) { setError(result.error); return; }
      setAccounts(result.accounts);
      setPage(result.page);
      setHasMore(result.hasMore);
      setTotalCount(result.totalCount);
    });
  }

  function toggleSuspension(account: AdminAccount, suspended: boolean) {
    if (suspended && !window.confirm(`Suspend sign-in for ${account.email}? They may remain signed in until their current access token expires.`)) return;
    startTransition(async () => {
      setPendingId(account.id);
      setError(null);
      setMessage("");
      const result = await changeAdminAccountStatus(account.id, suspended);
      setPendingId(null);
      if (!result.ok) { setError(result.error); return; }
      const refreshed = await loadAdminAccounts(queryRef.current.trim().slice(0, 200), page);
      if (refreshed.error) { setError(refreshed.error); return; }
      setAccounts(refreshed.accounts);
      setTotalCount(refreshed.totalCount);
      setMessage(suspended ? `Sign-in suspended for ${account.email}.` : `Sign-in restored for ${account.email}.`);
    });
  }

  return <section aria-label="Account directory" className="admin-directory">
    <div className="admin-directory-heading"><div><span className="calendar-eyebrow">Authentication accounts</span><h2>Account directory</h2><p>Search all registered email addresses and suspend or restore sign-in access.</p></div><label className="admin-search"><span className="sr-only">Search all account email addresses</span><span aria-hidden="true" className="material-symbols-outlined">search</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search all accounts" value={query} /></label></div>
    <p className="admin-directory-notice"><span className="material-symbols-outlined" aria-hidden="true">info</span>Suspension blocks future sign-ins. Existing sessions may remain active until their current access token expires. All administrator accounts are protected from suspension here.</p>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {message && <p className="notice notice-success" role="status">{message}</p>}
    <div className="admin-table-scroll"><table className="admin-users-table"><thead><tr><th>Email</th><th>Created</th><th>Last sign-in</th><th>Email status</th><th>Access</th><th>Action</th></tr></thead><tbody>{accounts.map((account) => {
      const suspended = account.bannedUntil ? new Date(account.bannedUntil).getTime() > Date.now() : false;
      return <tr key={account.id}><td className="admin-user-email">{account.email}</td><td>{formatDate(account.createdAt)}</td><td>{formatDate(account.lastSignInAt)}</td><td><span className={account.emailConfirmedAt ? "admin-user-pill is-confirmed" : "admin-user-pill"}>{account.emailConfirmedAt ? "Confirmed" : "Pending"}</span></td><td><span className={account.isAdmin ? "admin-user-pill is-admin" : suspended ? "admin-user-pill is-suspended" : "admin-user-pill is-active"}>{account.isAdmin ? "Administrator" : suspended ? "Suspended" : "Active"}</span></td><td>{account.canManage ? <button className={suspended ? "admin-user-action restore" : "admin-user-action suspend"} disabled={isPending} onClick={() => toggleSuspension(account, !suspended)} type="button">{pendingId === account.id ? "Saving…" : suspended ? "Restore" : "Suspend"}</button> : <span className="admin-self-label">{account.isAdmin ? "Protected" : "You"}</span>}</td></tr>;
    })}</tbody></table></div>
    {!accounts.length && <div className="admin-directory-empty">{query ? "No accounts match that email." : "No accounts were returned."}</div>}
    <div className="admin-pagination"><span>Page {page} · Showing {accounts.length} of {totalCount.toLocaleString()} matching accounts</span><div><button disabled={page <= 1 || isPending} onClick={() => changePage(page - 1)} type="button">Previous</button><button disabled={!hasMore || isPending} onClick={() => changePage(page + 1)} type="button">Next</button></div></div>
  </section>;
}
