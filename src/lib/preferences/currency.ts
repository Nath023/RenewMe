"use client";

import { useCallback, useEffect, useState } from "react";

export type DisplayCurrency = "USD" | "NGN";
const STORAGE_KEY = "renewme.displayCurrency";
const EVENT_NAME = "renewme:displayCurrency";
const FX_STORAGE_KEY = "renewme.usdNgnRate";
const FX_EVENT = "renewme:usdNgnRate";
const HORIZON_STORAGE_KEY = "renewme.reminderHorizon";
const HORIZON_EVENT = "renewme:reminderHorizon";
const WEEK_START_STORAGE_KEY = "renewme.weekStart";
const WEEK_START_EVENT = "renewme:weekStart";
export const DEFAULT_USD_NGN_RATE = 1550;
export const DEFAULT_REMINDER_HORIZON = 30;

function validCurrency(value: string | null): value is DisplayCurrency {
  return value === "USD" || value === "NGN";
}

export function useDisplayCurrency(initialCurrency: DisplayCurrency = "NGN") {
  const [currency, setCurrency] = useState<DisplayCurrency>(initialCurrency);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (validCurrency(saved)) setCurrency(saved);
    } catch {
      // Keep the app usable when browser storage is unavailable.
    }

    const handlePreferenceChange = (event: Event) => {
      const selected = (event as CustomEvent<string>).detail;
      if (validCurrency(selected)) setCurrency(selected);
    };
    window.addEventListener(EVENT_NAME, handlePreferenceChange);
    return () => window.removeEventListener(EVENT_NAME, handlePreferenceChange);
  }, []);

  const updateCurrency = useCallback((selected: DisplayCurrency) => {
    setCurrency(selected);
    try {
      window.localStorage.setItem(STORAGE_KEY, selected);
    } catch {
      // The in-memory preference still applies for the current page.
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: selected }));
  }, []);

  return [currency, updateCurrency] as const;
}

function readNumber(key: string, fallback: number, minimum: number, maximum: number) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
  } catch { return fallback; }
}

function useNumberPreference(key: string, eventName: string, fallback: number, minimum: number, maximum: number) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    setValue(readNumber(key, fallback, minimum, maximum));
    const sync = (event: Event) => {
      const next = Number((event as CustomEvent<number>).detail);
      if (Number.isFinite(next) && next >= minimum && next <= maximum) setValue(next);
    };
    window.addEventListener(eventName, sync);
    return () => window.removeEventListener(eventName, sync);
  }, [eventName, fallback, key, maximum, minimum]);
  const update = useCallback((next: number) => {
    if (!Number.isFinite(next) || next < minimum || next > maximum) return;
    setValue(next);
    try { window.localStorage.setItem(key, String(next)); } catch { /* Keep current-page preference. */ }
    window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
  }, [eventName, key, maximum, minimum]);
  return [value, update] as const;
}

export function useUsdNgnRate() {
  return useNumberPreference(FX_STORAGE_KEY, FX_EVENT, DEFAULT_USD_NGN_RATE, 1, 1_000_000);
}

export function useReminderHorizon() {
  return useNumberPreference(HORIZON_STORAGE_KEY, HORIZON_EVENT, DEFAULT_REMINDER_HORIZON, 7, 90);
}

export type WeekStart = "monday" | "sunday";
export function useWeekStart() {
  const [value, setValue] = useState<WeekStart>("monday");
  useEffect(() => {
    try { if (window.localStorage.getItem(WEEK_START_STORAGE_KEY) === "sunday") setValue("sunday"); } catch { /* Use Monday as default. */ }
    const sync = (event: Event) => {
      const next = (event as CustomEvent<WeekStart>).detail;
      if (next === "monday" || next === "sunday") setValue(next);
    };
    window.addEventListener(WEEK_START_EVENT, sync);
    return () => window.removeEventListener(WEEK_START_EVENT, sync);
  }, []);
  const update = useCallback((next: WeekStart) => {
    setValue(next);
    try { window.localStorage.setItem(WEEK_START_STORAGE_KEY, next); } catch { /* Keep current-page preference. */ }
    window.dispatchEvent(new CustomEvent(WEEK_START_EVENT, { detail: next }));
  }, []);
  return [value, update] as const;
}
