import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  fingerprint,
  planIngestion,
  type IngestionInput,
  type KnownEntry,
  type NormalizedEntry,
} from "@/domain/ingestion";

const entry = (
  externalId: string,
  amount: bigint,
  extra: Partial<NormalizedEntry> = {},
): NormalizedEntry => ({
  externalId,
  status: "POSTED",
  externalAccountId: "acct-1",
  date: "2026-03-05",
  amount,
  payee: "Grocer",
  ...extra,
});

const ingested = (
  e: NormalizedEntry,
  extra: Partial<KnownEntry> = {},
): KnownEntry => ({
  externalId: e.externalId,
  externalAccountId: e.externalAccountId,
  status: e.status,
  date: e.date,
  amount: e.amount,
  payee: e.payee,
  transactionId: `txn-${e.externalId}`,
  voided: false,
  ...extra,
});

const input = (over: Partial<IngestionInput> = {}): IngestionInput => ({
  entries: [],
  known: [],
  candidates: [],
  linked: ["acct-1"],
  ...over,
});

const kinds = (i: IngestionInput) =>
  planIngestion(i).decisions.map((d) => d.kind);

describe("provider ingestion planning", () => {
  it("creates unseen entries and ignores unlinked accounts entirely", () => {
    const plan = planIngestion(
      input({
        entries: [
          entry("a", -1000n),
          entry("b", -2000n, { externalAccountId: "other" }),
        ],
      }),
    );
    expect(plan.decisions).toEqual([
      { kind: "create", entry: entry("a", -1000n) },
      { kind: "ignored", externalId: "b", reason: "unlinked" },
    ]);
  });

  it("is idempotent: reimporting an unchanged batch changes nothing", () => {
    const a = entry("a", -1000n),
      b = entry("b", -2500n, { date: "2026-03-07" });
    const i = input({ entries: [a, b], known: [ingested(a), ingested(b)] });
    expect(kinds(i)).toEqual(["unchanged", "unchanged"]);
    expect(planIngestion(i).corrections).toBe(0);
  });

  it("ignores provider page order", () => {
    const a = entry("a", -1000n, { date: "2026-03-01" });
    const b = entry("b", -2000n, { date: "2026-03-09" });
    const forward = planIngestion(input({ entries: [a, b] }));
    const reverse = planIngestion(input({ entries: [b, a] }));
    expect(reverse).toEqual(forward);
  });

  it("promotes a pending entry when its posted row arrives on a later page", () => {
    const pending = entry("p", -1000n, { status: "PENDING" });
    const posted = entry("x", -1150n, {
      pendingExternalId: "p",
      date: "2026-03-06",
    });
    const plan = planIngestion(
      input({ entries: [posted], known: [ingested(pending)] }),
    );
    expect(plan.decisions).toEqual([
      { kind: "promote", externalId: "x", from: "p", entry: posted },
    ]);
    // The superseded pending row must not also be reported as removed.
    expect(plan.decisions.some((d) => d.kind === "remove")).toBe(false);
  });

  it("amends a changed pending entry in place but corrects a changed posted one", () => {
    const pending = entry("p", -1000n, { status: "PENDING" });
    const tipped = entry("p", -1180n, { status: "PENDING" });
    expect(
      kinds(input({ entries: [tipped], known: [ingested(pending)] })),
    ).toEqual(["amend"]);
    const posted = entry("q", -1000n);
    const changed = entry("q", -1200n);
    const plan = planIngestion(
      input({ entries: [changed], known: [ingested(posted)] }),
    );
    expect(
      kinds(input({ entries: [changed], known: [ingested(posted)] })),
    ).toEqual(["correct"]);
    expect(plan.corrections).toBe(1);
  });

  it("records a posted payee rename quietly, as YNAB does", () => {
    const posted = entry("q", -1000n, { payee: "PIN POS ACME 3711" });
    const renamed = entry("q", -1000n, { payee: "Acme Markets" });
    expect(
      kinds(input({ entries: [renamed], known: [ingested(posted)] })),
    ).toEqual(["amend-payee"]);
    // A new date is still a correction for the owner to review.
    expect(
      kinds(
        input({
          entries: [{ ...renamed, date: "2026-03-07" }],
          known: [ingested(posted)],
        }),
      ),
    ).toEqual(["correct"]);
  });

  it("re-keys a posted row the bank re-issued under a new ID", () => {
    const old = entry("TRN-old", -12784n, { payee: "Target" });
    const again = entry("TRN-new", -12784n, {
      payee: "Target",
      previousExternalId: "TRN-old",
    });
    expect(
      planIngestion(input({ entries: [again], known: [ingested(old)] }))
        .decisions,
    ).toEqual([
      { kind: "rekey", externalId: "TRN-new", from: "TRN-old", entry: again },
    ]);
    // Never when the old ID is still reported, a different amount, or unknown.
    expect(
      kinds(input({ entries: [old, again], known: [ingested(old)] })),
    ).toEqual(["create", "unchanged"]);
    expect(
      kinds(
        input({
          entries: [{ ...again, amount: -100n }],
          known: [ingested(old)],
        }),
      ),
    ).toEqual(["create"]);
    expect(kinds(input({ entries: [again] }))).toEqual(["create"]);
  });

  it("corrects only an explicit provider removal", () => {
    const gone = entry("gone", -4000n);
    const plan = planIngestion(
      input({ entries: [], removed: ["gone"], known: [ingested(gone)] }),
    );
    expect(plan.decisions).toEqual([
      { kind: "remove", externalId: "gone", transactionId: "txn-gone" },
    ]);
    expect(plan.corrections).toBe(1);
  });

  it("never removes an entry belonging to an account that is no longer linked", () => {
    const other = entry("o", -500n, { externalAccountId: "unlinked" });
    expect(kinds(input({ entries: [], known: [ingested(other)] }))).toEqual([]);
  });

  it("proposes a manual match instead of merging or duplicating", () => {
    const i = input({
      entries: [entry("a", -1000n)],
      candidates: [
        {
          transactionId: "manual-1",
          externalAccountId: "acct-1",
          date: "2026-03-04",
          amount: -1000n,
          payee: "GROCER #221",
        },
      ],
    });
    expect(planIngestion(i).decisions).toEqual([
      { kind: "propose-match", externalId: "a", transactionId: "manual-1" },
      { kind: "create", entry: entry("a", -1000n) },
    ]);
    // A declined proposal must not come back, and must not silently merge either.
    expect(kinds({ ...i, declined: ["a"] })).toEqual(["create"]);
  });

  it("does not propose a match outside the date window or on a different amount", () => {
    const candidate = {
      transactionId: "manual-1",
      externalAccountId: "acct-1",
      date: "2026-02-01",
      amount: -1000n,
      payee: "Grocer",
    };
    expect(
      kinds(input({ entries: [entry("a", -1000n)], candidates: [candidate] })),
    ).toEqual(["create"]);
    expect(
      kinds(
        input({
          entries: [entry("a", -999n)],
          candidates: [{ ...candidate, date: "2026-03-05" }],
        }),
      ),
    ).toEqual(["create"]);
  });

  it("proposes one transfer for an opposing pair across two linked accounts", () => {
    const out = entry("out", -5000n);
    const into = entry("in", 5000n, {
      externalAccountId: "acct-2",
      date: "2026-03-06",
      payee: "Transfer",
    });
    const plan = planIngestion(
      input({ entries: [out, into], linked: ["acct-1", "acct-2"] }),
    );
    expect(plan.decisions).toEqual([
      { kind: "create", entry: out },
      { kind: "propose-transfer", externalId: "in", counterpartId: "out" },
      { kind: "create", entry: into },
    ]);
    expect(plan.proposals).toBe(1);
  });

  it("does not treat opposing amounts inside one account as a transfer", () => {
    const out = entry("out", -5000n);
    const into = entry("in", 5000n, { payee: "Refund" });
    expect(kinds(input({ entries: [out, into] })).sort()).toEqual([
      "create",
      "create",
    ]);
  });

  it("rejects a batch that repeats an external ID or carries no amount", () => {
    expect(() =>
      planIngestion(input({ entries: [entry("a", -1n), entry("a", -2n)] })),
    ).toThrow("repeats an external ID");
    expect(() => planIngestion(input({ entries: [entry("a", 0n)] }))).toThrow(
      "no amount",
    );
  });

  it("normalises payee noise without collapsing distinct payees", () => {
    expect(fingerprint("GROCER #221  ")).toBe("grocer 221");
    expect(fingerprint("Grocer")).not.toBe(fingerprint("Butcher"));
  });

  it("re-planning its own result is stable for any generated batch", () => {
    const row = fc.record({
      externalId: fc.string({ minLength: 1, maxLength: 6 }),
      amount: fc.bigInt({ min: -50000n, max: 50000n }).filter((n) => n !== 0n),
      day: fc.integer({ min: 1, max: 28 }),
      pending: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(row, { selector: (r) => r.externalId, maxLength: 12 }),
        (rows) => {
          const entries = rows.map((r) =>
            entry(r.externalId, r.amount, {
              date: `2026-03-${r.day.toString().padStart(2, "0")}`,
              status: r.pending ? ("PENDING" as const) : ("POSTED" as const),
            }),
          );
          const first = planIngestion(input({ entries }));
          // Everything planned as a create, once ingested, must settle to unchanged.
          const known = first.decisions
            .filter((d) => d.kind === "create")
            .map((d) => ingested((d as { entry: NormalizedEntry }).entry));
          const second = planIngestion(input({ entries, known }));
          expect(second.decisions.every((d) => d.kind === "unchanged")).toBe(
            true,
          );
          expect(second.corrections).toBe(0);
          expect(
            planIngestion(input({ entries: [...entries].reverse() })),
          ).toEqual(first);
        },
      ),
      { numRuns: 300 },
    );
  });
});

it("empty and partial deltas never remove older entries", () => {
  const a = entry("a", -100n),
    b = entry("b", -200n);
  expect(
    planIngestion(input({ known: [ingested(a)], entries: [] })).decisions,
  ).toEqual([]);
  expect(
    planIngestion(input({ known: [ingested(a)], entries: [b] })).decisions,
  ).toEqual([{ kind: "create", entry: b }]);
});
it("does not post the pending side when both statuses arrive in one batch", () => {
  const pending = entry("p", -100n, { status: "PENDING" });
  const posted = entry("x", -150n, { pendingExternalId: "p" });
  expect(
    planIngestion(input({ entries: [pending, posted] })).decisions,
  ).toEqual([{ kind: "create", entry: posted }]);
});
it("consumes an explicitly removed pending identity exactly once on promotion", () => {
  const p = entry("p", -100n, { status: "PENDING" });
  const x = entry("x", -150n, { pendingExternalId: "p" });
  expect(
    planIngestion(
      input({
        entries: [x],
        known: [ingested(p, { transactionId: null })],
        removed: ["p"],
      }),
    ).decisions,
  ).toEqual([{ kind: "promote", externalId: "x", from: "p", entry: x }]);
});
