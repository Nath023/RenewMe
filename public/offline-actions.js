(() => {
  const dbName = "renewme-offline";
  const storeName = "ledgers";
  const form = document.getElementById("new-record");
  const list = document.getElementById("records");
  const message = document.getElementById("message");
  const connection = document.getElementById("connection");
  if (!form || !list) return;

  const style = document.createElement("style");
  style.textContent = ".item-actions{display:flex;align-items:center;gap:5px}.small-button{border:1px solid #c8c2b7;background:#fff;padding:4px 7px;color:#1f4d3a;font-size:10px;cursor:pointer}.small-button.danger{color:#a73826}";
  document.head.append(style);

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "userId" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function readLedger(userId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(userId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      request.addEventListener("loadend", () => db.close(), { once: true });
    });
  }
  async function saveLedger(ledger) {
    ledger.updatedAt = new Date().toISOString();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(ledger);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.addEventListener("loadend", () => db.close(), { once: true });
    });
  }
  function getSession() {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (value.access_token && value.user?.id) return { key, value };
      } catch { /* Ignore unrelated storage entries. */ }
    }
    return null;
  }
  function writes(ledger) {
    if (!Array.isArray(ledger.pendingWrites)) ledger.pendingWrites = ledger.pendingCreates || [];
    ledger.pendingCreates = ledger.pendingWrites;
    return ledger.pendingWrites;
  }
  function draw(ledger) {
    const rows = [...ledger.rows].sort((a, b) => String(a.renewal_date).localeCompare(String(b.renewal_date)));
    const pending = new Set(writes(ledger).map((row) => row.id));
    list.replaceChildren();
    rows.forEach((row) => {
      const item = document.createElement("article");
      item.className = "item";
      item.dataset.id = row.id;
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = row.vendor;
      const detail = document.createElement("span");
      detail.textContent = `${row.currency} ${Number(row.amount).toFixed(2)} · ${row.billing_cycle} · Renews ${row.renewal_date} · ${row.status}`;
      copy.append(title, detail);
      item.append(copy);
      const actions = document.createElement("div");
      actions.className = "item-actions";
      if (pending.has(row.id)) {
        const badge = document.createElement("span");
        badge.className = "pill";
        badge.textContent = "Queued";
        actions.append(badge);
      }
      const edit = document.createElement("button");
      edit.className = "small-button";
      edit.dataset.action = "edit";
      edit.type = "button";
      edit.textContent = "Edit";
      actions.append(edit);
      if (row.status !== "archived") {
        const archive = document.createElement("button");
        archive.className = "small-button danger";
        archive.dataset.action = "archive";
        archive.type = "button";
        archive.textContent = "Archive";
        actions.append(archive);
      }
      item.append(actions);
      list.append(item);
    });
    document.getElementById("empty").hidden = rows.length > 0;
    document.getElementById("empty").textContent = rows.length ? "" : "No saved subscription records are available on this device yet.";
    document.getElementById("snapshot-info").textContent = `${rows.length} saved records · ${writes(ledger).length} waiting to sync`;
    document.getElementById("updated").textContent = new Date(ledger.updatedAt).toLocaleString();
  }
  function showError(text) {
    message.className = "message error";
    message.textContent = text;
  }
  function queue(ledger, row) {
    const pending = writes(ledger);
    const index = pending.findIndex((item) => item.id === row.id);
    if (index === -1) pending.push(row);
    else pending[index] = row;
  }
  function sessionKey() { return getSession(); }
  async function accessToken(ledger, current) {
    if (current.value.expires_at && current.value.expires_at > Date.now() / 1000 + 30) return current.value.access_token;
    const response = await fetch(ledger.apiUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: ledger.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: current.value.refresh_token }),
    });
    if (!response.ok) throw new Error("Reconnect and sign in again to sync your queued changes.");
    current.value = { ...current.value, ...await response.json() };
    localStorage.setItem(current.key, JSON.stringify(current.value));
    return current.value.access_token;
  }
  async function sync() {
    const current = sessionKey();
    if (!navigator.onLine || !current) return;
    const ledger = await readLedger(current.value.user.id);
    if (!ledger || !writes(ledger).length) return;
    connection.textContent = "Syncing";
    try {
      const token = await accessToken(ledger, current);
      while (writes(ledger).length) {
        const row = writes(ledger)[0];
        const response = await fetch(ledger.apiUrl + "/rest/v1/subscriptions?on_conflict=id", {
          method: "POST",
          headers: { apikey: ledger.anonKey, authorization: "Bearer " + token, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(row),
        });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "RenewMe could not verify this account. Sign in online to sync safely." : "Could not sync yet. Your queued change is still saved on this device.");
        writes(ledger).shift();
        ledger.pendingCreates = ledger.pendingWrites;
        await saveLedger(ledger);
      }
      message.className = "message";
      message.textContent = "All queued changes are synced to your account.";
      connection.textContent = "Online";
      draw(ledger);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Sync failed. The local queue is kept.");
      connection.textContent = "Sync pending";
    }
  }

  list.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!button) return;
    const current = sessionKey();
    if (!current) return showError("Sign in online to access this private offline folio.");
    const ledger = await readLedger(current.value.user.id);
    const row = ledger?.rows.find((item) => item.id === button.closest(".item")?.dataset.id);
    if (!ledger || !row) return;
    if (button.dataset.action === "edit") {
      form.dataset.editId = row.id;
      for (const key of ["vendor", "amount", "currency", "billing_cycle", "renewal_date", "category", "status", "service_details", "cancel_by"]) {
        form.elements.namedItem(key).value = row[key] ?? "";
      }
      document.getElementById("save").textContent = "Queue changes";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (button.dataset.action === "archive" && confirm("Archive " + row.vendor + "?")) {
      const updated = { ...row, status: "archived", updated_at: new Date().toISOString() };
      ledger.rows = ledger.rows.map((item) => item.id === row.id ? updated : item);
      queue(ledger, updated);
      await saveLedger(ledger);
      draw(ledger);
      message.className = "message";
      message.textContent = navigator.onLine ? "Archive queued. Syncing now…" : "Archive queued on this device.";
      if (navigator.onLine) void sync();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const current = sessionKey();
    if (!current) return showError("Sign in online to access this private offline folio.");
    const ledger = await readLedger(current.value.user.id);
    if (!ledger) return showError("Open your subscriptions online once to prepare this device.");
    const data = new FormData(form);
    const vendor = String(data.get("vendor") || "").trim();
    const amount = Number(data.get("amount"));
    const renewalDate = String(data.get("renewal_date") || "");
    const cancelBy = String(data.get("cancel_by") || "") || null;
    if (!vendor || !Number.isFinite(amount) || amount < 0 || !renewalDate || (cancelBy && cancelBy > renewalDate)) return showError("Check the vendor, amount, renewal date, and cancel-by date.");
    const existing = form.dataset.editId ? ledger.rows.find((row) => row.id === form.dataset.editId) : null;
    const now = new Date().toISOString();
    const row = {
      ...(existing || {}), id: existing?.id || crypto.randomUUID(), user_id: current.value.user.id, vendor, amount,
      currency: String(data.get("currency")), billing_cycle: String(data.get("billing_cycle")), renewal_date: renewalDate, cancel_by: cancelBy,
      category: String(data.get("category") || "Other").trim() || "Other", service_details: String(data.get("service_details") || "").trim() || null,
      payment_instrument: existing?.payment_instrument ?? null, status: String(data.get("status") || "active"),
      created_at: existing?.created_at || now, updated_at: now,
    };
    if (existing) ledger.rows = ledger.rows.map((item) => item.id === row.id ? row : item);
    else ledger.rows.unshift(row);
    queue(ledger, row);
    try {
      await saveLedger(ledger);
      form.reset();
      delete form.dataset.editId;
      document.getElementById("save").textContent = "Queue subscription";
      message.className = "message";
      message.textContent = navigator.onLine ? "Change queued. Syncing now…" : "Change queued on this device and will sync when you reconnect.";
      draw(ledger);
      if (navigator.onLine) void sync();
    } catch { showError("This browser could not save offline data. Check storage permissions."); }
  }, true);

  const observer = new MutationObserver(() => {
    const current = sessionKey();
    if (!current) return;
    void readLedger(current.value.user.id).then((ledger) => { if (ledger && list.children.length && !list.querySelector(".item-actions")) draw(ledger); }).catch(() => undefined);
  });
  observer.observe(list, { childList: true });
  if (list.children.length && !list.querySelector(".item-actions")) {
    const current = sessionKey();
    if (current) void readLedger(current.value.user.id).then((ledger) => { if (ledger) draw(ledger); }).catch(() => undefined);
  }
  addEventListener("online", () => void sync());
})();
