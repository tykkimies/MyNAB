import { describe, expect, it } from "vitest";
import { csvTable, dollars, escapeCell } from "@/domain/export";

describe("portable CSV", () => {
  it("escapes text a spreadsheet would execute, but never money", () => {
    for (const hostile of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx"])
      expect(escapeCell(hostile).replace(/^"|"$/g, "").startsWith("'")).toBe(
        true,
      );
    expect(escapeCell(dollars(-1234n))).toBe("-12.34");
    expect(escapeCell(dollars(5n))).toBe("0.05");
    expect(escapeCell("Plain")).toBe("Plain");
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(true)).toBe("true");
  });

  it("quotes commas, quotes and newlines per RFC 4180", () => {
    expect(
      csvTable(
        ["A", "B"],
        [
          ["x, y", 'say "hi"'],
          ["line\nbreak", dollars(-100n)],
        ],
      ),
    ).toBe('A,B\r\n"x, y","say ""hi"""\r\n"line\nbreak",-1.00\r\n');
  });
});
