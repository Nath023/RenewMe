"use client";

import Link from "next/link";
import { AccountMenu } from "@/components/account/account-menu";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importSubscriptions } from "@/app/actions/subscriptions";
import { createTelegramLink, saveEmailReminderPreference, sendTestReminderEmail, unlinkTelegram } from "@/app/actions/settings";
import { signOutAction } from "@/app/actions/auth";
import { useDisplayCurrency, useReminderHorizon, useUsdNgnRate, useWeekStart } from "@/lib/preferences/currency";
import type { Subscription } from "@/lib/subscriptions/types";

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

type ExchangeRateMetadata = { source: "manual" | "provider"; updatedAt: string; refreshedAt?: string };
const exchangeRateMetadataKey = "renewme.usdNgnRateMetadata";
const exchangeRateAttemptKey = "renewme.usdNgnRateAttempt";
const refreshInterval = 24 * 60 * 60 * 1000;

function downloadRecords(rows: Subscription[], accountName: string) {
  const contents = JSON.stringify({ exported_at: new Date().toISOString(), account: accountName, format_version: 1, subscriptions: rows }, null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `renewme-subscriptions-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Sidebar({ accountName, isAdmin }: { accountName: string; isAdmin: boolean }) {
  return (
    <aside className="ledger-sidebar">
      <div>
        <div className="brand-row"><Link className="brand-name" href="/dashboard">RenewMe</Link><span className="folio-version">FOLIO V2.4</span><span className="sync-dot" title="Account connected" /></div>
        <div className="register-label"><span>Ledger Register</span><span>#04</span></div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link className="nav-link" href="/dashboard"><Icon>dashboard</Icon><span>Dashboard</span></Link>
          <Link className="nav-link" href="/subscriptions"><Icon>receipt_long</Icon><span>Subscriptions</span></Link>
          <Link className="nav-link" href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link>
          <Link className="nav-link" href="/reports"><Icon>analytics</Icon><span>Reports</span></Link>
          <Link className="nav-link" href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link>
          {isAdmin && <Link className="nav-link" href="/admin"><Icon>admin_panel_settings</Icon><span>Admin overview</span></Link>}
          <Link aria-current="page" className="nav-link nav-link-active" href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
      </div>
      <div className="account-card"><div><strong>{accountName}</strong><span>Private ledger <i /> <b>Connected</b></span></div><div className="account-card-actions"><Link aria-label="Settings" className="account-settings-link" href="/settings"><Icon>settings</Icon></Link><form action={signOutAction}><button aria-label="Sign out" className="calendar-signout" type="submit"><Icon>logout</Icon></button></form></div></div>
    </aside>
  );
}

export function SettingsCenter({ accountName, workspaceName = "Ledger Register", initialCurrency = "NGN", rows = [], preview = false, error, isAdmin = false, emailRemindersEnabled = false, telegramLinked = false, telegramBotUsername, pushEnabled: initialPushEnabled = false, pushPublicKey, preferenceError, settingsError, settingsMessage }: { accountName: string; workspaceName?: string; initialCurrency?: "USD" | "NGN"; rows?: Subscription[]; preview?: boolean; error?: string; isAdmin?: boolean; emailRemindersEnabled?: boolean; telegramLinked?: boolean; telegramBotUsername?: string; pushEnabled?: boolean; pushPublicKey?: string; preferenceError?: string; settingsError?: string; settingsMessage?: string }) {
  const restoreFileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [restoreRows, setRestoreRows] = useState<Record<string, unknown>[] | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [restoreMessage, setRestoreMessage] = useState("");
  const [isRestoring, startRestore] = useTransition();
  const [currency, setCurrency] = useDisplayCurrency(initialCurrency);
  const [rate, setRate] = useUsdNgnRate();
  const [rateMetadata, setRateMetadata] = useState<ExchangeRateMetadata | null>(null);
  const [rateRefreshing, setRateRefreshing] = useState(false);
  const [rateRefreshError, setRateRefreshError] = useState("");
  const [rateRefreshMessage, setRateRefreshMessage] = useState("");
  const [horizon, setHorizon] = useReminderHorizon();
  const [weekStart, setWeekStart] = useWeekStart();
  const [telegramUrl, setTelegramUrl] = useState("");
  const [telegramError, setTelegramError] = useState("");
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(initialPushEnabled);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushMessage, setPushMessage] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(exchangeRateMetadataKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && "source" in parsed && "updatedAt" in parsed && (parsed.source === "manual" || parsed.source === "provider") && typeof parsed.updatedAt === "string") {
          setRateMetadata(parsed as ExchangeRateMetadata);
        }
      }
    } catch { /* Keep the active rate usable if browser storage is unavailable. */ }
  }, []);

  function saveRateMetadata(metadata: ExchangeRateMetadata) {
    setRateMetadata(metadata);
    try { window.localStorage.setItem(exchangeRateMetadataKey, JSON.stringify(metadata)); } catch { /* The current view still reflects the selected source. */ }
  }

  async function refreshExchangeRate() {
    setRateRefreshError("");
    setRateRefreshMessage("");
    const now = Date.now();
    try {
      const previousAttempt = Number(window.localStorage.getItem(exchangeRateAttemptKey));
      if (Number.isFinite(previousAttempt) && now - previousAttempt < 60 * 60 * 1000) {
        setRateRefreshError("A refresh was attempted within the last hour. Wait before trying again.");
        return;
      }
      if (rateMetadata?.refreshedAt && now - Date.parse(rateMetadata.refreshedAt) < refreshInterval) {
        setRateRefreshMessage("This provider updates once per day. The latest available reference rate is already saved.");
        return;
      }
      window.localStorage.setItem(exchangeRateAttemptKey, String(now));
      setRateRefreshing(true);
      const response = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`The rate provider returned HTTP ${response.status}.`);
      const result: unknown = await response.json();
      if (!result || typeof result !== "object") throw new Error("The rate provider returned an unreadable response.");
      const payload = result as { result?: unknown; base_code?: unknown; rates?: { NGN?: unknown }; time_last_update_utc?: unknown };
      const nextRate = Number(payload.rates?.NGN);
      if (payload.result !== "success" || payload.base_code !== "USD" || !Number.isFinite(nextRate) || nextRate < 1 || nextRate > 1_000_000 || typeof payload.time_last_update_utc !== "string" || !Number.isFinite(Date.parse(payload.time_last_update_utc))) {
        throw new Error("The provider response did not include a valid USD to NGN reference rate.");
      }
      setRate(nextRate);
      saveRateMetadata({ source: "provider", updatedAt: payload.time_last_update_utc, refreshedAt: new Date().toISOString() });
      setRateRefreshMessage("Daily reference rate updated. Estimates are still not a quote for a bank or card charge.");
    } catch (cause) {
      setRateRefreshError(cause instanceof Error ? cause.message : "Could not refresh the reference rate.");
    } finally {
      setRateRefreshing(false);
    }
  }

  async function readBackup(file?: File) {
    setRestoreError("");
    setRestoreMessage("");
    setRestoreRows(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setRestoreError("Choose a JSON backup smaller than 2 MB."); return; }
    try {
      const backup: unknown = JSON.parse(await file.text());
      if (!backup || typeof backup !== "object" || (backup as { format_version?: unknown }).format_version !== 1 || !Array.isArray((backup as { subscriptions?: unknown }).subscriptions)) {
        throw new Error("This file is not a RenewMe JSON backup.");
      }
      const parsedRows = (backup as { subscriptions: unknown[] }).subscriptions;
      if (parsedRows.length < 1 || parsedRows.length > 500 || parsedRows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error("The backup must contain between 1 and 500 subscription records.");
      }
      setRestoreRows(parsedRows as Record<string, unknown>[]);
    } catch (cause) {
      setRestoreError(cause instanceof Error ? cause.message : "Could not read this JSON backup.");
    }
  }

  function restoreBackup() {
    if (!restoreRows || preview) return;
    setRestoreError("");
    setRestoreMessage("");
    startRestore(async () => {
      const result = await importSubscriptions(restoreRows);
      if (!result.success) { setRestoreError(result.error); return; }
      setRestoreMessage(`${result.count} ${result.count === 1 ? "subscription was" : "subscriptions were"} restored. Existing records were left unchanged.`);
      setRestoreRows(null);
      if (restoreFileInput.current) restoreFileInput.current.value = "";
      router.refresh();
    });
  }

  async function connectTelegram() {
    setTelegramBusy(true);
    setTelegramError("");
    const result = await createTelegramLink();
    if (result.error) setTelegramError(result.error);
    else if (result.url) setTelegramUrl(result.url);
    setTelegramBusy(false);
  }

  function decodeApplicationServerKey(key: string) {
    const padded = key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - key.length % 4) % 4);
    return Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
  }

  async function togglePushNotifications() {
    setPushError("");
    setPushMessage("");
    setPushBusy(true);
    try {
      if (!pushPublicKey) throw new Error("Browser push is not configured yet. Add the VAPID keys to the server environment.");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("This browser does not support push notifications.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      if (pushEnabled) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch("/api/push/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
          if (!response.ok) throw new Error("Could not remove the saved push subscription.");
          await subscription.unsubscribe();
        }
        setPushEnabled(false);
        setPushMessage("Browser push reminders turned off for this browser.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked in this browser. Allow them in browser site settings, then try again." : "Allow notifications to enable browser reminders.");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeApplicationServerKey(pushPublicKey) as BufferSource });
      const response = await fetch("/api/push/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) {
        await subscription.unsubscribe();
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not save the browser push subscription.");
      }
      setPushEnabled(true);
      setPushMessage("Browser push reminders are enabled on this browser.");
    } catch (cause) {
      setPushError(cause instanceof Error ? cause.message : "Could not update browser notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="ledger-app settings-app">
      <Sidebar accountName={accountName} isAdmin={isAdmin} />
      <div className="ledger-main">
        <header className="calendar-topbar"><Link href="/dashboard"><Icon>menu_book</Icon><span><strong>RenewMe</strong> — Settings</span></Link><AccountMenu accountName={accountName} authenticated={!preview} /></header>
        <nav aria-label="Mobile navigation" className="mobile-nav">
          <Link href="/dashboard"><Icon>dashboard</Icon><span>Home</span></Link><Link href="/subscriptions"><Icon>receipt_long</Icon><span>Ledger</span></Link><Link href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link><Link href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link><Link href="/reports"><Icon>analytics</Icon><span>Reports</span></Link><Link aria-current="page" href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
        <main className="settings-content">
          <div className="calendar-kicker"><span>{workspaceName} · Preferences</span><span>{preview ? "Preview account" : "Account settings"}</span></div>
          <div className="settings-heading"><div><h1>Settings</h1><p>Manage how RenewMe displays your ledger and find your account tools.</p></div></div>
          {preview && <div className="preview-banner"><Icon>visibility</Icon><span><strong>Preview mode</strong> · Your display preference is stored only in this browser until you connect an account.</span></div>}
          {error && <p className="notice notice-error" role="alert">Could not load subscription records for export: {error}</p>}
          {settingsError && <p className="notice notice-error" role="alert">{settingsError}</p>}
          {preferenceError && <p className="notice notice-error" role="alert">{preferenceError}</p>}
          {settingsMessage && <p className="notice notice-success" role="status">{settingsMessage}</p>}

          <div className="settings-grid">
            <section className="settings-panel">
              <div className="settings-panel-heading"><span className="settings-module">01</span><div><h2>Display &amp; calendar</h2><p>Set how currencies and renewal dates appear across RenewMe.</p></div></div>
              <div className="settings-field-row"><div><strong>Base display currency</strong><small>Used by the ledger, dashboard, and expenditure report.</small></div><label className="settings-select-label"><span className="sr-only">Base display currency</span><select onChange={(event) => setCurrency(event.target.value as "USD" | "NGN")} value={currency}><option value="NGN">NGN · Nigerian naira</option><option value="USD">USD · US dollar</option></select></label></div>
              <div className="settings-field-row"><div><strong>USD to NGN estimate</strong><small>Daily reference rate or a manual rate for cross-currency estimates.</small></div><label className="settings-rate-input"><span className="sr-only">Naira per US dollar</span><span>₦</span><input aria-label="Naira per US dollar" min="1" max="1000000" onChange={(event) => { const next = Number(event.target.value); if (next >= 1 && next <= 1000000) { setRate(next); saveRateMetadata({ source: "manual", updatedAt: new Date().toISOString(), ...(rateMetadata?.refreshedAt ? { refreshedAt: rateMetadata.refreshedAt } : {}) }); setRateRefreshError(""); setRateRefreshMessage("Manual rate saved on this device."); } }} step="0.01" type="number" value={rate} /><span>/ $1</span></label></div>
              <div aria-label="Exchange rate status" className="settings-fx-status"><div><span>Active estimate</span><strong>₦{rate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $1</strong></div><span className={`settings-fx-badge${rateRefreshError ? " settings-fx-badge-error" : ""}`}><i />{rateRefreshError ? "REFRESH FAILED · SAVED RATE IN USE" : rateMetadata?.source === "provider" ? "DAILY REFERENCE · PROVIDER" : "MANUAL · THIS DEVICE"}</span><p>{rateMetadata?.source === "provider" ? `Provider rate timestamp: ${new Date(rateMetadata.updatedAt).toLocaleString("en-NG")}.` : "The active estimate is stored in this browser. Refresh a daily reference rate or enter your own estimate."} Actual bank and card rates may differ.</p><div className="settings-fx-actions"><button className="settings-inline-action" disabled={rateRefreshing} onClick={() => void refreshExchangeRate()} type="button"><Icon>{rateRefreshing ? "progress_activity" : "refresh"}</Icon>{rateRefreshing ? "Refreshing…" : "Refresh daily reference"}</button><a href="https://www.exchangerate-api.com" rel="noreferrer" target="_blank">Rates by ExchangeRate-API</a></div>{rateRefreshError && <p className="settings-fx-error" role="alert">{rateRefreshError} The last saved estimate remains active.</p>}{rateRefreshMessage && <p className="settings-fx-feedback" role="status">{rateRefreshMessage}</p>}</div>
              <p className="settings-saved-note"><Icon>devices</Icon>Currency and estimate rate are saved in this browser and shared across RenewMe screens on this device.</p>
              <div className="settings-benchmark"><span>Estimate only · actual settlement rates may differ</span></div>
              <div className="settings-subsection-label">Calendar</div>
              <div className="settings-field-row"><div><strong>Week starts on</strong><small>Changes the renewal calendar headings and date grid.</small></div><label className="settings-select-label"><span className="sr-only">Calendar week starts on</span><select onChange={(event) => setWeekStart(event.target.value as "monday" | "sunday")} value={weekStart}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></label></div>
            </section>

            <section className="settings-panel">
              <div className="settings-panel-heading"><span className="settings-module">02</span><div><h2>Reminder schedule</h2><p>Review the deadline list generated from your subscription dates.</p></div></div>
              <div className="settings-field-row"><div><strong>Upcoming window</strong><small>Controls the upcoming deadline list and summary.</small></div><label className="settings-select-label"><span className="sr-only">Upcoming reminder window</span><select onChange={(event) => setHorizon(Number(event.target.value))} value={horizon}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label></div>
              {!preview && <div className="settings-field-row"><div><strong>Email renewal reminders</strong><small>Two emails: 7 days and 1 day before renewal or cancellation deadlines.</small></div><form action={saveEmailReminderPreference}><input name="email_enabled" type="hidden" value={emailRemindersEnabled ? "false" : "true"} /><button className="settings-inline-action" disabled={Boolean(preferenceError)} type="submit">{emailRemindersEnabled ? "Turn off" : "Enable email"}</button></form></div>}
              {!preview && <div className="settings-field-row"><div><strong>Test delivery</strong><small>Send a test message to {accountName}.</small></div><form action={sendTestReminderEmail}><button className="settings-inline-action" type="submit">Send test email</button></form></div>}
              <div className="settings-reminder-horizons"><div><strong>{horizon} days</strong><span>Upcoming window</span></div><div><strong>7 days</strong><span>Review window</span></div><div><strong>1 day</strong><span>Final cutoff</span></div></div>
              {!preview && <div className="settings-field-row"><div><strong>Telegram reminders</strong><small>{telegramLinked ? "Your Telegram chat is linked and will receive renewal and cancellation reminders." : "Link your Telegram account to receive reminders in chat."}</small></div>{telegramLinked ? <form action={unlinkTelegram}><button className="settings-inline-action" type="submit">Disconnect</button></form> : telegramUrl ? <div><a className="settings-inline-action" href={telegramUrl} rel="noreferrer" target="_blank">Open Telegram to connect</a><button className="settings-inline-action" onClick={() => router.refresh()} type="button">Check connection</button></div> : <button className="settings-inline-action" disabled={telegramBusy} onClick={() => void connectTelegram()} type="button">{telegramBusy ? "Preparing…" : "Connect Telegram"}</button>}</div>}
              {telegramError && <p className="notice notice-error" role="alert">{telegramError}</p>}
              {!preview && telegramBotUsername && !telegramLinked && !telegramUrl && <p className="settings-capability-note"><Icon>info</Icon>Telegram connection links expire after 15 minutes. Telegram delivery requires the bot webhook and server token to be configured.</p>}
              {!preview && <div className="settings-field-row"><div><strong>Browser push notifications</strong><small>{pushEnabled ? "Enabled on this browser. Other browsers and devices must be connected separately." : "Receive reminders from this browser after granting notification permission."}</small></div><button className="settings-inline-action" disabled={pushBusy || !pushPublicKey} onClick={() => void togglePushNotifications()} type="button">{pushBusy ? "Updating…" : pushEnabled ? "Turn off" : "Enable browser push"}</button></div>}
              {pushError && <p className="notice notice-error" role="alert">{pushError}</p>}{pushMessage && <p className="notice notice-success" role="status">{pushMessage}</p>}
              {!preview && !pushPublicKey && <p className="settings-capability-note"><Icon>info</Icon>Browser push requires VAPID keys and an HTTPS site. Notification permission is saved separately for each browser.</p>}
              <Link className="settings-inline-link" href="/reminders">Open reminders <Icon>arrow_forward</Icon></Link>
            </section>

            <section className="settings-panel">
              <div className="settings-panel-heading"><span className="settings-module">03</span><div><h2>Account &amp; access</h2><p>Your records are protected by your signed-in account.</p></div></div>
              <div className="settings-field-row"><div><strong>Signed-in account</strong><small>Account used to scope your subscription records.</small></div><span className="settings-account-value">{accountName}</span></div>
              <div className="settings-field-row"><div><strong>Row-level protection</strong><small>Supabase policies restrict records to their owner.</small></div><span className="settings-status"><i /> Enabled</span></div>
              {isAdmin && <div className="settings-field-row"><div><strong>Platform administration</strong><small>Open the aggregate account and subscription overview.</small></div><Link className="settings-inline-action" href="/admin">Admin console <Icon>arrow_forward</Icon></Link></div>}
              {!preview && <form action={signOutAction} className="settings-action-row"><span><strong>End this session</strong><small>Sign out of RenewMe on this device.</small></span><button className="button button-secondary" type="submit">Sign out</button></form>}
            </section>

            <section className="settings-panel">
              <div className="settings-panel-heading"><span className="settings-module">04</span><div><h2>Data &amp; exports</h2><p>Review or download the records currently in your ledger.</p></div></div>
              <div className="settings-export-card"><Icon>archive</Icon><div><strong>Subscription folio</strong><small>Open the report to print a folio or export CSV with annualized estimates.</small></div><Link className="button button-secondary" href="/reports">Open report</Link></div>
              <div className="settings-export-card"><Icon>download</Icon><div><strong>JSON data copy</strong><small>Download {rows.length} {rows.length === 1 ? "subscription record" : "subscription records"} with the account and payment reference fields you entered.</small></div><button className="button button-secondary" disabled={Boolean(error)} onClick={() => downloadRecords(rows, accountName)} type="button">Download JSON</button></div>
              {!preview && <div className="settings-restore-card"><div><strong>Restore subscriptions from JSON</strong><small>Review a RenewMe JSON copy, then add its records to this ledger. Current records are not overwritten.</small></div><input accept="application/json,.json" className="sr-only" onChange={(event) => { void readBackup(event.target.files?.[0]); event.currentTarget.value = ""; }} ref={restoreFileInput} type="file" /><button className="button button-secondary" disabled={isRestoring} onClick={() => restoreFileInput.current?.click()} type="button">Choose backup</button></div>}
              {restoreError && <p className="notice notice-error settings-restore-notice" role="alert">{restoreError}</p>}
              {restoreRows && <div className="settings-restore-preview"><strong>Backup ready · {restoreRows.length} {restoreRows.length === 1 ? "record" : "records"}</strong><span>{restoreRows.slice(0, 4).map((row) => String(row.vendor ?? "Unnamed service")).join(" · ")}{restoreRows.length > 4 ? ` · +${restoreRows.length - 4} more` : ""}</span><small>Restoring the same file again will add duplicate records.</small><button className="button button-primary" disabled={isRestoring} onClick={restoreBackup} type="button">{isRestoring ? "Restoring…" : `Add ${restoreRows.length} records`}</button></div>}
              {restoreMessage && <p className="notice notice-success settings-restore-notice" role="status">{restoreMessage}</p>}
              <p className="settings-capability-note"><Icon>lock</Icon>JSON backups and the offline folio are stored unencrypted on this device. Avoid shared devices. Restore adds subscription details only; invoice files and renewal history are not included.</p>
            </section>
          </div>
          <footer className="calendar-footer"><span><Icon>verified_user</Icon>RenewMe settings · Local display preference and account-scoped ledger</span><Link href="/dashboard">Return to dashboard</Link></footer>
        </main>
      </div>
    </div>
  );
}
