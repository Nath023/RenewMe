import Link from "next/link";

export default function NotFound() {
  return (
    <main className="folio-not-found">
      <section aria-labelledby="not-found-title" className="folio-not-found-card">
        <header className="folio-not-found-header">
          <div><span className="folio-error-dot" /> <span>Docket error</span><b>·</b><span>Folio leaf unlocated</span><b>·</b><strong>HTTP 404</strong></div>
          <span>REGISTER NO. 884-X</span>
        </header>
        <div className="folio-not-found-code"><span>404</span><i /><small>ERR_ENTRY_VOID</small></div>
        <h1 id="not-found-title">Folio leaf not found.</h1>
        <p>The requested ledger leaf or commitment record does not exist or has been permanently archived.</p>
        <div className="folio-not-found-action">
          <Link className="button button-primary" href="/dashboard"><span aria-hidden="true" className="material-symbols-outlined">arrow_back</span>Return to Dashboard</Link>
          <span><small>STATUS</small><b>UNRECONCILED</b></span>
        </div>
      </section>
      <footer className="folio-not-found-footer"><span>REFERENCE HASH: 0x404_ERR_LEAF_VOID</span><span>VERIFIED LEDGER PROTOCOL</span><span>RENEWME FOLIO V2.4</span></footer>
    </main>
  );
}
