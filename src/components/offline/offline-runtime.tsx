"use client";

import { useEffect } from "react";

const rateKey = "renewme.usdNgnRate";
const rateMetadataKey = "renewme.usdNgnRateMetadata";
const rateMetadataEvent = "renewme:usdNgnRateMetadata";
const dailyRefresh = 24 * 60 * 60 * 1000;

export function OfflineRuntime() {
  useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    let savedMetadata: { source?: unknown; refreshedAt?: unknown } | null = null;
    try {
      const rawMetadata = localStorage.getItem(rateMetadataKey);
      if (rawMetadata) savedMetadata = JSON.parse(rawMetadata) as { source?: unknown; refreshedAt?: unknown };
    } catch { /* The automatic refresh still works when local storage is unavailable. */ }
    if (savedMetadata?.source === "manual") return;
    if (savedMetadata?.source === "provider" && typeof savedMetadata.refreshedAt === "string" && Date.now() - Date.parse(savedMetadata.refreshedAt) < dailyRefresh) return;

    const controller = new AbortController();
    void fetch("/api/exchange-rate/usd-ngn", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { rate?: unknown; updatedAt?: unknown };
        const rate = Number(payload.rate);
        if (!response.ok || !Number.isFinite(rate) || rate < 1 || rate > 1_000_000 || typeof payload.updatedAt !== "string" || !Number.isFinite(Date.parse(payload.updatedAt))) return;
        const metadata = { source: "provider" as const, updatedAt: payload.updatedAt, refreshedAt: new Date().toISOString() };
        localStorage.setItem(rateKey, String(rate));
        localStorage.setItem(rateMetadataKey, JSON.stringify(metadata));
        window.dispatchEvent(new CustomEvent("renewme:usdNgnRate", { detail: rate }));
        window.dispatchEvent(new CustomEvent(rateMetadataEvent, { detail: metadata }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return null;
}
