import type { SubscriptionDraft } from "@/lib/subscriptions/types";

export type InvoiceExtraction = {
  text: string;
  candidates: Partial<Pick<SubscriptionDraft, "vendor" | "amount" | "currency" | "renewal_date" | "billing_cycle" | "service_details" | "category" | "payment_instrument" | "cancel_by">> & {
    invoice_number?: string;
    billing_period?: string;
  };
};

type ProgressUpdate = (message: string, progress?: number) => void;

function canvasFromImage(file: File) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(3, 2800 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { URL.revokeObjectURL(objectUrl); reject(new Error("Could not prepare the invoice image for text recognition.")); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // Grayscale and boost contrast a little to help OCR read phone photos and faint scans.
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
        const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128));
        pixels.data[index] = contrast;
        pixels.data[index + 1] = contrast;
        pixels.data[index + 2] = contrast;
      }
      context.putImageData(pixels, 0, 0);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("The selected image could not be read.")); };
    image.src = objectUrl;
  });
}

function parseAmount(source: string): number | undefined {
  // Ignore currency symbols and normalize comma/period decimal conventions.
  const token = source.match(/\d[\d., ]*\d|\d/)?.[0]?.replace(/\s/g, "");
  if (!token) return undefined;
  const lastComma = token.lastIndexOf(",");
  const lastPeriod = token.lastIndexOf(".");
  let normalized = token;
  if (lastComma >= 0 && lastPeriod >= 0) {
    const decimal = lastComma > lastPeriod ? "," : ".";
    normalized = token.replace(/[.,]/g, (separator, index) => separator === decimal && index === token.lastIndexOf(decimal) ? "." : "");
  } else if (lastComma >= 0 || lastPeriod >= 0) {
    const separator = lastComma >= 0 ? "," : ".";
    const last = Math.max(lastComma, lastPeriod);
    const decimals = token.length - last - 1;
    normalized = decimals > 0 && decimals <= 2
      ? `${token.slice(0, last).replace(/[.,]/g, "")}.${token.slice(last + 1)}`
      : token.replace(/[.,]/g, "");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function extractCandidates(text: string): InvoiceExtraction["candidates"] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const boilerplate = /^(invoice|receipt|tax invoice|bill to|ship to|statement|page\s+\d+|invoice number|invoice no\.?|date|due date|description|qty|quantity|unit price|subtotal|tax|vat|payment method|thank you)/i;
  const vendorLabel = lines.find((line) => /^(?:merchant|vendor|seller|service provider|from)\s*[:\-]/i.test(line));
  const labeledVendor = vendorLabel?.replace(/^(?:merchant|vendor|seller|service provider|from)\s*[:\-]\s*/i, "").trim();
  const vendor = labeledVendor && labeledVendor.length >= 2
    ? labeledVendor
    : lines.slice(0, 10).find((line) => line.length >= 2 && line.length <= 80 && !boilerplate.test(line) && !/^\S+@\S+\.\S+$/.test(line) && !/^(https?:\/\/|www\.)/i.test(line) && !/^[$€£₦\d\s.,:/-]+$/.test(line));

  // Do not guess from the first currency-looking number: it is often an invoice ID,
  // tax, or line item. Only suggest an amount adjacent to a clear total label.
  const amountLine = lines.find((line) => /\b(grand total|total due|amount due|balance due|invoice total|total paid|total charged|renewal amount|total)\b/i.test(line) && !/\b(subtotal|tax total|previous total)\b/i.test(line) && /\d/.test(line));
  const amountContext = amountLine?.replace(/\b(grand total|total due|amount due|balance due|invoice total|total paid|total charged|renewal amount|total)\b/ig, " ");
  const amount = amountContext ? parseAmount(amountContext) : undefined;
  const currencyContext = `${amountLine ?? ""} ${lines.slice(0, 20).join(" ")}`;
  const currency = /\bNGN\b|₦/.test(currencyContext) ? "NGN" : /\bUSD\b|\$/.test(currencyContext) ? "USD" : undefined;

  const labeledValue = (pattern: RegExp, maxLength = 250) => {
    const line = lines.find((candidate) => pattern.test(candidate));
    const value = line?.replace(pattern, "").trim();
    return value ? value.slice(0, maxLength) : undefined;
  };
  const parseLabeledDate = (pattern: RegExp) => {
    const lineIndex = lines.findIndex((line) => pattern.test(line));
    if (lineIndex < 0) return undefined;
    const source = lines.slice(lineIndex, lineIndex + 2).join(" ").replace(pattern, " ");
    const isoDate = source.match(/\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)\b/);
    if (isoDate) {
      const normalized = `${isoDate[1]}-${isoDate[2].padStart(2, "0")}-${isoDate[3].padStart(2, "0")}`;
      const parsed = new Date(`${normalized}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized) return normalized;
    }
    const longDate = source.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?[,]?\s+(20\d{2})\b/i);
    if (longDate) {
      const parsed = new Date(`${longDate[2]} ${longDate[1]}, ${longDate[3]} UTC`);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
    return undefined;
  };
  const renewalDate = parseLabeledDate(/\b(next renewal|renewal date|renews on|next billing date|next payment date|billing date)\b/i);
  const cancelBy = parseLabeledDate(/\b(cancel by|cancel before|cancellation deadline|notice deadline)\b/i);
  const billingCycleLabel = labeledValue(/^(?:billing cycle|billing frequency|billing cadence|subscription interval)\s*[:\-]\s*/i, 60)?.toLowerCase();
  const cycleText = billingCycleLabel ?? lines.find((line) => /^billed\s+(monthly|quarterly|annually|yearly|every month|every 3 months)\b/i.test(line))?.replace(/^billed\s+/i, "").toLowerCase();
  const billingCycle = cycleText && /quarter|every 3 months/.test(cycleText) ? "quarterly" : cycleText && /annual|yearly/.test(cycleText) ? "annual" : cycleText && /month/.test(cycleText) ? "monthly" : undefined;
  const serviceDetails = labeledValue(/^(?:service details|subscription plan|plan details|plan|product|service tier)\s*[:\-]\s*/i, 500);
  const category = labeledValue(/^(?:expense )?category\s*[:\-]\s*/i, 100);
  const paymentInstrument = labeledValue(/^(?:payment method|payment instrument|paid via|payment source)\s*[:\-]\s*/i, 250);
  const invoiceNumber = labeledValue(/^(?:invoice number|invoice no\.?|invoice #|receipt number|reference number)\s*[:\-#]?\s*/i, 80);
  const billingPeriod = labeledValue(/^(?:billing period|service period|subscription period)\s*[:\-]\s*/i, 100);
  return {
    ...(vendor ? { vendor: vendor.slice(0, 250) } : {}),
    ...(amount !== undefined ? { amount } : {}),
    ...(currency ? { currency } : {}),
    ...(renewalDate ? { renewal_date: renewalDate } : {}),
    ...(billingCycle ? { billing_cycle: billingCycle } : {}),
    ...(serviceDetails ? { service_details: serviceDetails } : {}),
    ...(category ? { category } : {}),
    ...(paymentInstrument ? { payment_instrument: paymentInstrument } : {}),
    ...(cancelBy ? { cancel_by: cancelBy } : {}),
    ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
    ...(billingPeriod ? { billing_period: billingPeriod } : {}),
  };
}

export async function extractInvoiceText(file: File, onProgress: ProgressUpdate): Promise<InvoiceExtraction> {
  const [{ createWorker }, pdfjs] = await Promise.all([import("tesseract.js"), import("pdfjs-dist")]);
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  const getWorker = async () => {
    if (!worker) {
      worker = await createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        cacheMethod: "write",
        logger: ({ status, progress }) => onProgress(status, progress),
      });
    }
    return worker;
  };
  try {
    let text = "";
    if (file.type === "application/pdf") {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const pdf = await loadingTask.promise;
      const pagesToRead = Math.min(pdf.numPages, 5);
      for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
        onProgress(`Reading PDF page ${pageNumber} of ${pagesToRead}`);
        const page = await pdf.getPage(pageNumber);
        const pageContent = await page.getTextContent();
        const selectableText = pageContent.items.map((item) => {
          if (!("str" in item)) return "";
          return `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`;
        }).join("").trim();
        const textQuality = (selectableText.match(/[\p{L}\p{N}]/gu)?.length ?? 0) / Math.max(selectableText.length, 1);
        if (selectableText.length > 40 && textQuality > 0.45) {
          text += `${selectableText}\n`;
          continue;
        }
        const initialViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 2200 / initialViewport.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare the PDF page for text recognition.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = await (await getWorker()).recognize(canvas);
        text += `${recognized.data.text}\n`;
        canvas.width = 0;
        canvas.height = 0;
      }
      await loadingTask.destroy();
      if (pdf.numPages > pagesToRead) onProgress(`First ${pagesToRead} of ${pdf.numPages} pages scanned`);
    } else {
      const canvas = await canvasFromImage(file);
      const recognized = await (await getWorker()).recognize(canvas);
      text = recognized.data.text;
      canvas.width = 0;
      canvas.height = 0;
    }
    return { text: text.trim(), candidates: extractCandidates(text) };
  } finally {
    if (worker) await worker.terminate();
  }
}
