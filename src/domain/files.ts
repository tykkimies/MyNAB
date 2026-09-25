/**
 * Bank file parsing for imports, per PROJECT_SPEC section 10. Pure: text in,
 * validated rows out. Rows then go through the same ingestion planner as bank
 * sync, so a file can never write the ledger in a way a bank could not.
 *
 * Limits are enforced here, before anything is stored. OFX/QFX is read with a
 * narrow tag scanner rather than an XML or SGML parser: it never processes a
 * DTD, entity or external reference, because it does not know what those are.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { financialDate } from "./dates";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;

/** A row accepted from a file, before the ingestion planner sees it. */
export interface FileRow {
  /** 1-based line or record number in the file, for messages. */
  line: number;
  date: string;
  /** Signed cents from the account's point of view: outflows negative. */
  amount: bigint;
  payee: string;
  memo: string;
  /**
   * Stable identity material. OFX supplies a bank transaction ID; CSV has
   * none, so identity is the row's content plus its occurrence number, which
   * makes re-importing the same or an overlapping file idempotent.
   */
  identity: string;
}
export interface RejectedRow {
  line: number;
  reason: string;
}
export interface ParsedFile {
  rows: FileRow[];
  rejected: RejectedRow[];
}

function checkSize(text: string) {
  if (text.length > MAX_FILE_BYTES) throw new Error("File is larger than 2 MB");
}

// ---------------------------------------------------------------- CSV

/** RFC 4180 records: quoted fields may hold commas, quotes and newlines. */
export function parseCsv(text: string): string[][] {
  checkSize(text);
  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((f) => f.trim() !== "")) records.push(record);
      record = [];
      if (records.length > MAX_ROWS + 1)
        throw new Error(`A file may hold at most ${MAX_ROWS} rows`);
    } else field += c;
  }
  if (quoted) throw new Error("A quoted field is never closed");
  record.push(field);
  if (record.some((f) => f.trim() !== "")) records.push(record);
  if (records.length > MAX_ROWS + 1)
    throw new Error(`A file may hold at most ${MAX_ROWS} rows`);
  return records;
}

export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
export interface CsvMapping {
  /** Zero-based column indexes. */
  date: number;
  dateFormat: DateFormat;
  payee: number;
  memo?: number;
  /** One signed column, or separate money-out and money-in columns. */
  amount?: number;
  /** When the file shows money leaving the account as a positive number. */
  invert?: boolean;
  outflow?: number;
  inflow?: number;
  /** Whether the first record is a header row. */
  header: boolean;
}

/** Exact cents from how banks write money: "$1,234.56", "(12.00)", "-3". */
export function parseAmount(raw: string): bigint | null {
  let text = raw.trim().replace(/[$\s]/g, "");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) text = text.slice(1);
  if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(/,/g, "").split(".");
  if (whole.length > 15) return null;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function parseDate(raw: string, format: DateFormat): string | null {
  const text = raw.trim();
  let y: string, m: string, d: string;
  if (format === "YYYY-MM-DD") {
    const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
    if (!match) return null;
    [, y, m, d] = match;
  } else {
    const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
    if (!match) return null;
    const [, a, b, year] = match;
    [m, d] = format === "MM/DD/YYYY" ? [a, b] : [b, a];
    // Two-digit years are read as this century; banks rarely export older.
    y = year.length === 2 ? `20${year}` : year;
  }
  const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  try {
    financialDate(date);
  } catch {
    return null;
  }
  return date;
}

/** Guess the columns from common bank header names. Only a starting point. */
export function guessMapping(headers: string[]): Partial<CsvMapping> {
  const find = (...patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const i = headers.findIndex((h) => pattern.test(h.trim()));
      if (i >= 0) return i;
    }
    return undefined;
  };
  const guess: Partial<CsvMapping> = {
    header: true,
    date: find(/^(posting |transaction |trans\.? )?date$/i, /date/i),
    payee: find(/^(payee|description|merchant|name)$/i, /desc|payee|merchant/i),
    memo: find(/^(memo|notes?|details?)$/i),
    amount: find(/^amount$/i, /amount/i),
    outflow: find(/^(debit|withdrawals?|money out|outflow)$/i),
    inflow: find(/^(credit|deposits?|money in|inflow)$/i),
  };
  if (guess.outflow !== undefined && guess.inflow !== undefined)
    delete guess.amount;
  return guess;
}

/** Apply a mapping to CSV records, validating every row. */
export function mapCsv(records: string[][], mapping: CsvMapping): ParsedFile {
  const body = mapping.header ? records.slice(1) : records;
  if (body.length > MAX_ROWS)
    throw new Error(`A file may hold at most ${MAX_ROWS} rows`);
  const split = mapping.outflow !== undefined || mapping.inflow !== undefined;
  if (!split && mapping.amount === undefined)
    throw new Error(
      "Choose an amount column, or money-out and money-in columns",
    );
  const rows: FileRow[] = [];
  const rejected: RejectedRow[] = [];
  const occurrences = new Map<string, number>();
  body.forEach((record, index) => {
    const line = index + (mapping.header ? 2 : 1);
    const cell = (i: number | undefined) =>
      i === undefined ? "" : (record[i] ?? "").trim();
    const date = parseDate(cell(mapping.date), mapping.dateFormat);
    if (!date) {
      rejected.push({
        line,
        reason: `Unreadable date "${cell(mapping.date).slice(0, 20)}"`,
      });
      return;
    }
    let amount: bigint | null;
    if (split) {
      const out = cell(mapping.outflow)
        ? parseAmount(cell(mapping.outflow))
        : 0n;
      const into = cell(mapping.inflow)
        ? parseAmount(cell(mapping.inflow))
        : 0n;
      if (out === null || into === null) amount = null;
      else {
        // Some banks sign the debit column; its size is what matters.
        const abs = (v: bigint) => (v < 0n ? -v : v);
        amount = abs(into) - abs(out);
      }
    } else {
      amount = parseAmount(cell(mapping.amount));
      if (amount !== null && mapping.invert) amount = -amount;
    }
    if (amount === null) {
      rejected.push({
        line,
        reason: "Unreadable amount (use whole cents at most)",
      });
      return;
    }
    if (amount === 0n) {
      rejected.push({ line, reason: "Zero amount" });
      return;
    }
    const payee = cell(mapping.payee).replace(/\s+/g, " ").slice(0, 120);
    const memo = cell(mapping.memo).replace(/\s+/g, " ").slice(0, 500);
    const content = JSON.stringify([
      date,
      amount.toString(),
      payee.toLowerCase(),
    ]);
    const n = (occurrences.get(content) ?? 0) + 1;
    occurrences.set(content, n);
    rows.push({
      line,
      date,
      amount,
      payee,
      memo,
      identity: `csv:${content}:${n}`,
    });
  });
  return { rows, rejected };
}

// ---------------------------------------------------------------- OFX / QFX

/** True when the text looks like OFX or QFX rather than CSV. */
export function isOfx(text: string) {
  return /<OFX>/i.test(text.slice(0, 4096 * 4)) || /^\s*OFXHEADER:/i.test(text);
}

function tag(block: string, name: string): string {
  // SGML OFX omits closing tags on leaf elements; XML OFX includes them.
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return match ? decode(match[1].trim()) : "";
}
/** Only the five predefined character references; nothing is ever resolved. */
function decode(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseOfx(text: string): ParsedFile & { currency: string } {
  checkSize(text);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("OFX files with a DOCTYPE or entities are not accepted");
  const currency = tag(text, "CURDEF").toUpperCase() || "USD";
  if (currency !== "USD")
    throw new Error(
      `Only USD statements are supported (found ${currency.slice(0, 3)})`,
    );
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length > MAX_ROWS)
    throw new Error(`A file may hold at most ${MAX_ROWS} transactions`);
  const rows: FileRow[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Set<string>();
  blocks.forEach((raw, index) => {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const line = index + 1;
    const posted = tag(block, "DTPOSTED");
    const date = /^\d{8}/.test(posted)
      ? `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`
      : "";
    try {
      financialDate(date);
    } catch {
      rejected.push({ line, reason: "Missing or unreadable DTPOSTED" });
      return;
    }
    // OFX already signs amounts from the account's side: debits negative.
    const amount = parseAmount(tag(block, "TRNAMT"));
    if (amount === null || amount === 0n) {
      rejected.push({ line, reason: "Missing, zero or sub-cent TRNAMT" });
      return;
    }
    const fitid = tag(block, "FITID").slice(0, 100);
    if (!fitid) {
      rejected.push({ line, reason: "Missing FITID" });
      return;
    }
    if (seen.has(fitid)) {
      rejected.push({ line, reason: "Repeats an earlier FITID in this file" });
      return;
    }
    seen.add(fitid);
    const payee = (
      tag(block, "NAME") ||
      tag(block, "PAYEE") ||
      tag(block, "MEMO")
    )
      .replace(/\s+/g, " ")
      .slice(0, 120);
    rows.push({
      line,
      date,
      amount,
      payee,
      memo: tag(block, "MEMO").slice(0, 500),
      identity: `ofx:${fitid}`,
    });
  });
  return { rows, rejected, currency };
}
