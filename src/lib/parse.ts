import type { InvoiceData, LineItem } from './types';
import { newId } from './id';
import { round2 } from './money';

export interface ParseResult {
  invoice: InvoiceData;
  /** True when the date was written like 03/04/2026 and day/month order had to be guessed. */
  dateAmbiguous: boolean;
}

/* ------------------------------------------------------------------ helpers */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Money as printed on invoices: 1,250.00 or 18.5 -> only 2-decimal amounts count. */
const AMOUNT = String.raw`\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}`;
const AMOUNT_G = new RegExp(String.raw`(?<![\d.,])(?:${AMOUNT})(?![\d])`, 'g');

const TOTALS_RE =
  /\b(sub\s?-?\s?total|grand\s+total|total|amount\s+due|balance(?:\s+due)?|tax|gst|hst|pst|qst|vat|shipping|freight|discount|deposit|paid|change)\b/i;
const META_RE =
  /\b(invoice|inv\b|date|due|tel|phone|fax|www|http|bill\s*to|ship\s*to|sold\s*to|terms|page|account|acct|po\s*box|customer|order\s*(no|#|number)|gst\s*#|hst\s*#|reg\.?\s*no|email)\b|@/i;
const HEADER_RE_A = /\b(description|item|items|product|particulars)\b/i;
const HEADER_RE_B = /\b(qty|quantity|price|rate|amount|total)\b/i;

/** Fix classic OCR confusions inside numeric-looking tokens only (S->$, O->0, l->1, 12,50 -> 12.50). */
export function fixNumericToken(tok: string): string {
  let t = tok.replace(/^[$€£]+/, '');
  t = t.replace(/^S(?=\d[\d,]*[.,]\d{2}$)/, '');
  if (/^[\dOolI|,.]+$/.test(t) && /[.,][\dOolI]{2}$/.test(t) && /\d/.test(t)) {
    t = t.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1');
    if (/^\d+,\d{2}$/.test(t)) t = t.replace(',', '.');
  }
  return t;
}

export function cleanLine(raw: string): string {
  return raw
    .replace(/[|_ \t]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(fixNumericToken)
    .join(' ')
    .trim();
}

function toNum(s: string): number {
  return round2(parseFloat(s.replace(/,/g, '')));
}

function amountsIn(line: string): number[] {
  return [...line.matchAll(AMOUNT_G)].map((m) => toNum(m[0]));
}

function lastAmount(line: string): number | null {
  const a = amountsIn(line);
  return a.length ? a[a.length - 1] : null;
}

function letterCount(s: string): number {
  return (s.match(/[A-Za-z]/g) ?? []).length;
}

/* ------------------------------------------------------------------- fields */

const TITLE_WORDS = ['invoice', 'receipt', 'statement', 'estimate', 'quote'];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** "INVOICE", but also what OCR makes of a big stylised title: "[NVOICE", "lNVOICE", "INV0ICE". */
export function looksLikeTitleWord(token: string): boolean {
  const t = token.replace(/[^A-Za-z0-9]/g, '').toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
  return TITLE_WORDS.some((w) => t.length >= w.length - 1 && levenshtein(t, w) <= (w.length >= 7 ? 2 : 1));
}

/**
 * The vendor is the first sensible text at the top-left of the page. OCR (with column spacing kept)
 * puts "Company Name        INVOICE" on one line, so we split on wide gaps and pipes and drop a trailing title.
 */
function findVendor(rawLines: string[]): string {
  for (const raw of rawLines.slice(0, 8)) {
    for (const segment of raw.split(/\s{3,}|\|/)) {
      const tokens = cleanLine(segment).split(' ').filter(Boolean);
      while (tokens.length > 1 && looksLikeTitleWord(tokens[tokens.length - 1])) tokens.pop();
      const l = tokens.join(' ');
      if (letterCount(l) < 4) continue;
      if (META_RE.test(l) || /\b(receipt|statement|quote|estimate|packing\s*slip)\b/i.test(l)) continue;
      const digits = (l.match(/\d/g) ?? []).length;
      if (digits / l.length > 0.3) continue;
      return l.replace(/^[^A-Za-z0-9(&]+|[^A-Za-z0-9.)&!]+$/g, '').trim();
    }
  }
  return '';
}

const DATE_LIKE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/;

function findInvoiceNumber(lines: string[]): string {
  const strong = /\b(?:invoice|inv(?![-\w]))\.?\s*(?:no\.?|number|num\.?|nr\.?|#)?[\s:#.~_=-]*([A-Z0-9][A-Z0-9\-/]{2,19})/gi;
  const weak = /(?:^|\s)(?:no\.?|#)[\s:.~_=-]*([A-Z0-9][A-Z0-9\-/]{2,19})/gi;
  const bare = /\b(INV[-#]?\d{2,}[A-Z0-9-]*)\b/g;
  for (const re of [strong, bare, weak]) {
    for (const l of lines) {
      for (const m of l.matchAll(re)) {
        const tok = m[1].replace(/[-/]+$/, '');
        if (/\d/.test(tok) && !DATE_LIKE.test(tok)) return tok;
      }
    }
  }
  return '';
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function dateFromLine(line: string): { iso: string; ambiguous: boolean } | null {
  let m = line.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m && isValidYmd(+m[1], +m[2], +m[3])) return { iso: iso(+m[1], +m[2], +m[3]), ambiguous: false };

  m = line.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (mi && isValidYmd(+m[3], mi, +m[1])) return { iso: iso(+m[3], mi, +m[1]), ambiguous: false };
  }
  m = line.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (mi && isValidYmd(+m[3], mi, +m[2])) return { iso: iso(+m[3], mi, +m[2]), ambiguous: false };
  }
  m = line.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12 && isValidYmd(y, b, a)) return { iso: iso(y, b, a), ambiguous: false }; // DD/MM
    if (b > 12 && isValidYmd(y, a, b)) return { iso: iso(y, a, b), ambiguous: false }; // MM/DD
    if (a <= 12 && b <= 12 && isValidYmd(y, a, b)) return { iso: iso(y, a, b), ambiguous: a !== b }; // guess MM/DD
  }
  return null;
}

function findDate(lines: string[]): { iso: string; ambiguous: boolean } {
  const preferred = lines.filter((l) => /date/i.test(l) && !/due|deliver|ship/i.test(l));
  const rest = lines.filter((l) => !preferred.includes(l));
  for (const l of [...preferred, ...rest]) {
    const d = dateFromLine(l);
    if (d) return d;
  }
  return { iso: '', ambiguous: false };
}

/* ---------------------------------------------------------------- line items */

function cleanDescription(s: string): string {
  return s
    .replace(/^[\s|:;.,\-_*]+|[\s|:;,\-_*]+$/g, '')
    .replace(/(?<=\d)\s?Ib\b/g, 'lb') // OCR reads "lb" as "Ib" after a number
    .replace(/\s+/g, ' ')
    .trim();
}

function parseItemLine(line: string): Omit<LineItem, 'id'> | null {
  const A = AMOUNT;
  let m: RegExpMatchArray | null;

  // description  qty  unit  amount
  m = line.match(new RegExp(String.raw`^(.*?\S)\s+(\d+(?:\.\d+)?)\s*(?:x|@)?\s+(${A})\s+(${A})$`));
  if (m) return build(m[1], +m[2], toNum(m[3]), toNum(m[4]));

  // qty  description  unit  amount
  m = line.match(new RegExp(String.raw`^(\d+(?:\.\d+)?)\s+(.*?\S)\s+(${A})\s+(${A})$`));
  if (m) return build(m[2], +m[1], toNum(m[3]), toNum(m[4]));

  // description  qty  amount   (unit price derived)
  m = line.match(new RegExp(String.raw`^(.*?\S)\s+(\d{1,4})\s+(${A})$`));
  if (m && +m[2] > 0) {
    const qty = +m[2];
    const amount = toNum(m[3]);
    return build(m[1], qty, round2(amount / qty), amount);
  }

  // description  amount
  m = line.match(new RegExp(String.raw`^(.*?\S)\s+(${A})$`));
  if (m) return build(m[1], 1, toNum(m[2]), toNum(m[2]));

  return null;

  function build(desc: string, qty: number, unitPrice: number, amount: number) {
    const description = cleanDescription(desc);
    if (letterCount(description) < 2) return null;
    return { description, qty, unitPrice, amount };
  }
}

/* -------------------------------------------------------------------- public */

export function parseInvoiceText(text: string): ParseResult {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lines = rawLines.map(cleanLine).filter((l) => l.length > 0);

  const vendor = findVendor(rawLines);
  const invoiceNumber = findInvoiceNumber(lines);
  const date = findDate(lines);

  let subtotal: number | null = null;
  let total: number | null = null;
  let tax = 0;
  let firstTotalsIdx = -1;

  lines.forEach((l, idx) => {
    const amt = lastAmount(l);
    if (amt === null) return;
    if (/sub\s?-?\s?total/i.test(l)) {
      subtotal = amt;
      if (firstTotalsIdx < 0) firstTotalsIdx = idx;
    } else if (/\b(gst|hst|pst|qst|vat|tax)\b/i.test(l) && !/\btotal\b/i.test(l)) {
      tax = round2(tax + amt);
      if (firstTotalsIdx < 0) firstTotalsIdx = idx;
    } else if (/\b(grand\s+total|total|amount\s+due|balance\s+due|total\s+due)\b/i.test(l) && !/\b(qty|tax)\b/i.test(l)) {
      total = amt;
      if (firstTotalsIdx < 0) firstTotalsIdx = idx;
    }
  });

  // Items live between the table header (if we can find it) and the first totals line.
  const headerIdx = lines.findIndex((l) => HEADER_RE_A.test(l) && HEADER_RE_B.test(l) && amountsIn(l).length === 0);
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const end = firstTotalsIdx >= 0 ? firstTotalsIdx : lines.length;
  const items: LineItem[] = [];
  for (const l of lines.slice(start, end)) {
    if (TOTALS_RE.test(l)) continue;
    if (headerIdx < 0 && META_RE.test(l)) continue;
    if (amountsIn(l).length === 0) continue;
    const parsed = parseItemLine(l);
    if (parsed) items.push({ id: newId(), ...parsed });
  }

  const itemsSum = round2(items.reduce((s, i) => s + i.amount, 0));
  const finalSubtotal: number = subtotal ?? (total !== null && tax ? round2(total - tax) : itemsSum);
  const finalTotal: number = total ?? round2(finalSubtotal + tax);

  return {
    invoice: {
      vendor,
      invoiceNumber,
      invoiceDate: date.iso,
      items,
      subtotal: finalSubtotal,
      tax,
      total: finalTotal,
    },
    dateAmbiguous: date.ambiguous,
  };
}
