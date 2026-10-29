import { NextResponse } from "next/server";

export const revalidate = 43_200;

type ExchangeRateApiResponse = {
  result?: unknown;
  base_code?: unknown;
  conversion_rates?: { NGN?: unknown };
  time_last_update_utc?: unknown;
  time_next_update_utc?: unknown;
  "error-type"?: unknown;
};

export async function GET() {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "ExchangeRate-API is not configured. Add EXCHANGE_RATE_API_KEY to the server environment." }, { status: 503 });
  }

  try {
    const response = await fetch("https://v6.exchangerate-api.com/v6/latest/USD", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: `ExchangeRate-API returned HTTP ${response.status}.` }, { status: 502 });
    }

    const payload = await response.json() as ExchangeRateApiResponse;
    const rate = Number(payload.conversion_rates?.NGN);
    const updatedAt = typeof payload.time_last_update_utc === "string" ? payload.time_last_update_utc : "";
    const nextUpdateAt = typeof payload.time_next_update_utc === "string" ? payload.time_next_update_utc : "";
    if (payload.result !== "success" || payload.base_code !== "USD" || !Number.isFinite(rate) || rate < 1 || rate > 1_000_000 || !Number.isFinite(Date.parse(updatedAt))) {
      const errorType = typeof payload["error-type"] === "string" ? payload["error-type"] : "invalid-response";
      const message = errorType === "invalid-key" || errorType === "inactive-account"
        ? "ExchangeRate-API rejected the configured key. Check the key and confirm the provider account."
        : errorType === "quota-reached"
          ? "The ExchangeRate-API request limit has been reached. The last saved rate remains in use."
          : "ExchangeRate-API did not return a valid USD to NGN reference rate.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ rate, updatedAt, nextUpdateAt, source: "ExchangeRate-API" }, {
      headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach ExchangeRate-API. The last saved rate remains in use." }, { status: 502 });
  }
}
