/**
 * Portable export formatting, per PROJECT_SPEC section 10. Pure.
 *
 * Spreadsheet formula injection: a text cell beginning with = + - @ or a tab
 * or carriage return is executed by Excel, LibreOffice and Sheets. Such text is
 * prefixed with an apostrophe. Money is not text: it is written as a typed
 * decimal, so a negative amount stays a number rather than being escaped.
 *
 * Domain module: no persistence, framework or provider imports.
 */

/** Exact dollars from integer cents, e.g. -1234n -> "-12.34". */
export class Decimal {
  constructor(readonly cents: bigint) {}
  toString() {
    const a = this.cents < 0n ? -this.cents : this.cents;
    return `${this.cents < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
  }
}
export const dollars = (cents: bigint) => new Decimal(cents);

export type Cell = string | number | boolean | Decimal | null | undefined;

export function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Decimal || typeof value === "number")
    text = String(value);
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvTable(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCell(cell)).join(","))
    .join("\r\n")
    .concat("\r\n");
}
