import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  guessMapping,
  isOfx,
  mapCsv,
  parseAmount,
  parseCsv,
  parseDate,
  parseOfx,
  MAX_ROWS,
} from "@/domain/files";

describe("CSV parsing", () => {
  it("handles quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const text =
      '\uFEFFDate,Description,Amount\r\n2026-03-01,"Cafe, ""Corner""",-4.50\r\n2026-03-02,"Two\nlines",10\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-03-01", 'Cafe, "Corner"', "-4.50"],
      ["2026-03-02", "Two\nlines", "10"],
    ]);
    expect(() => parseCsv('a,"open')).toThrow("never closed");
  });

  it("reads bank money formats exactly and refuses sub-cent values", () => {
    expect(parseAmount("$1,234.56")).toBe(123456n);
    expect(parseAmount("(12.00)")).toBe(-1200n);
    expect(parseAmount("-3")).toBe(-300n);
    expect(parseAmount("7.5")).toBe(750n);
    expect(parseAmount("12.00-")).toBe(-1200n);
    expect(parseAmount("+0.01")).toBe(1n);
    for (const bad of ["1.234", "abc", "1,23", "", "1e5", "12,34.00"])
      expect(parseAmount(bad)).toBeNull();
  });

  it("reads the three date layouts and rejects impossible dates", () => {
    expect(parseDate("2026-3-9", "YYYY-MM-DD")).toBe("2026-03-09");
    expect(parseDate("03/09/2026", "MM/DD/YYYY")).toBe("2026-03-09");
    expect(parseDate("09/03/26", "DD/MM/YYYY")).toBe("2026-03-09");
    expect(parseDate("02/30/2026", "MM/DD/YYYY")).toBeNull();
    expect(parseDate("2026-13-01", "YYYY-MM-DD")).toBeNull();
  });

  it("maps signed, inverted and split amount columns, reporting bad rows", () => {
    const records = parseCsv(
      "Date,Payee,Debit,Credit,Amount\n03/01/2026,Grocer,12.00,,12.00\n03/02/2026,Employer,,500,-500\n03/03/2026,Bad,x,,1\nnot a date,Z,1,,1\n",
    );
    const guess = guessMapping(records[0]);
    expect(guess).toMatchObject({ date: 0, payee: 1, outflow: 2, inflow: 3 });
    const split = mapCsv(records, {
      header: true,
      date: 0,
      dateFormat: "MM/DD/YYYY",
      payee: 1,
      outflow: 2,
      inflow: 3,
    });
    expect(split.rows.map((r) => r.amount)).toEqual([-1200n, 50000n]);
    expect(split.rejected.map((r) => r.line)).toEqual([4, 5]);
    const inverted = mapCsv(records, {
      header: true,
      date: 0,
      dateFormat: "MM/DD/YYYY",
      payee: 1,
      amount: 4,
      invert: true,
    });
    expect(inverted.rows.slice(0, 2).map((r) => r.amount)).toEqual([
      -1200n,
      50000n,
    ]);
  });

  it("gives identical rows distinct, stable identities so re-import is idempotent", () => {
    const text =
      "2026-03-01,Coffee,-3\n2026-03-01,coffee,-3\n2026-03-02,Coffee,-3\n";
    const mapping = {
      header: false,
      date: 0,
      dateFormat: "YYYY-MM-DD" as const,
      payee: 1,
      amount: 2,
    };
    const first = mapCsv(parseCsv(text), mapping).rows.map((r) => r.identity);
    const again = mapCsv(parseCsv(text), mapping).rows.map((r) => r.identity);
    expect(new Set(first).size).toBe(3);
    expect(again).toEqual(first);
  });

  it("enforces the row limit", () => {
    const text = "2026-03-01,A,-1\n".repeat(MAX_ROWS + 2);
    expect(() => parseCsv(text)).toThrow("at most");
  });

  it("never loses or invents a record for arbitrary quoted content", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(fc.string({ maxLength: 12 }), {
            minLength: 2,
            maxLength: 4,
          }),
          {
            minLength: 1,
            maxLength: 20,
          },
        ),
        (table) => {
          const rows = table.filter((r) => r.some((f) => f.trim() !== ""));
          const text = rows
            .map((r) => r.map((f) => `"${f.replace(/"/g, '""')}"`).join(","))
            .join("\r\n");
          expect(parseCsv(text)).toEqual(rows);
        },
      ),
    );
  });
});

describe("OFX and QFX parsing", () => {
  const sgml = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260305120000[-5:EST]<TRNAMT>-42.10<FITID>A1<NAME>GROCER &amp; CO<MEMO>card 1234
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260306<TRNAMT>1500.00<FITID>A2<NAME>PAYROLL
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260307<TRNAMT>-1.005<FITID>A3<NAME>BAD
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260308<TRNAMT>-5<FITID>A1<NAME>REPEAT
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it("reads SGML statements with bank IDs as identity", () => {
    expect(isOfx(sgml)).toBe(true);
    const parsed = parseOfx(sgml);
    expect(parsed.rows).toEqual([
      {
        line: 1,
        date: "2026-03-05",
        amount: -4210n,
        payee: "GROCER & CO",
        memo: "card 1234",
        identity: "ofx:A1",
      },
      {
        line: 2,
        date: "2026-03-06",
        amount: 150000n,
        payee: "PAYROLL",
        memo: "",
        identity: "ofx:A2",
      },
    ]);
    expect(parsed.rejected.map((r) => r.line)).toEqual([3, 4]);
  });

  it("reads XML statements with closing tags", () => {
    const xml = `<?xml version="1.0"?><OFX><CURDEF>USD</CURDEF><STMTTRN><DTPOSTED>20260310</DTPOSTED><TRNAMT>-9.99</TRNAMT><FITID>X9</FITID><NAME>Streaming</NAME></STMTTRN></OFX>`;
    expect(parseOfx(xml).rows[0]).toMatchObject({
      date: "2026-03-10",
      amount: -999n,
      payee: "Streaming",
      identity: "ofx:X9",
    });
  });

  it("refuses entity declarations, foreign currency and oversized files", () => {
    expect(() =>
      parseOfx(
        '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><OFX>&e;</OFX>',
      ),
    ).toThrow("DOCTYPE");
    expect(() => parseOfx("<OFX><CURDEF>EUR<STMTTRN></OFX>")).toThrow("USD");
    expect(() => parseOfx("x".repeat(2 * 1024 * 1024 + 1))).toThrow("2 MB");
  });
});
