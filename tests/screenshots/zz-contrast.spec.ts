import "../database-env";
import { expect, test, type Page } from "@playwright/test";
import { getDb } from "../../src/infrastructure/db";
const route = (path: string) => `${process.env.APP_BASE_PATH ?? ""}${path}`;
const password = "synthetic-e2e-passphrase-123";
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await getDb().$disconnect();
});
async function signIn(page: Page) {
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page.getByLabel("Passphrase", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
}
/**
 * Walks every visible text node, resolves the background it actually sits on
 * (climbing ancestors past transparent fills, and giving up on gradients), and
 * reports WCAG 2.1 contrast failures. Rendered rather than reasoned about, so
 * inherited colours and theme inversion are both accounted for.
 */
const AUDIT = `() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map((n) => parseFloat(n));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const direct = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim(),
    );
    if (!direct) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.opacity === "0") continue;
    const fg = parse(s.color);
    if (!fg || fg.a === 0) continue;
    let bg = null;
    let gradient = false;
    for (let n = el; n; n = n.parentElement) {
      const ns = getComputedStyle(n);
      if (ns.backgroundImage && ns.backgroundImage !== "none") {
        gradient = true;
        break;
      }
      const c = parse(ns.backgroundColor);
      if (c && c.a > 0) {
        bg = bg ? over(bg, c) : c;
        if (bg.a >= 1) break;
      }
    }
    // A gradient backdrop has no single colour to measure; those are the hero
    // cards, which use fixed tokens and are checked by eye.
    if (gradient || !bg) continue;
    const size = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(over(fg, bg), bg);
    if (got < need) {
      out.push({
        text: el.textContent.trim().slice(0, 45),
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute("class") || "").slice(0, 90),
        color: s.color,
        bg: \`rgb(\${Math.round(bg.r)}, \${Math.round(bg.g)}, \${Math.round(bg.b)})\`,
        size: size + "px/" + weight,
        ratio: Math.round(got * 100) / 100,
        need,
      });
    }
  }
  return out;
}`;
test("reports colour-contrast failures on every route, both themes", async ({
  page,
}) => {
  const paths = [
    "/budget",
    "/accounts",
    "/goals",
    "/debt",
    "/accounts/connections",
    "/accounts/schedules",
    "/accounts/rules",
    "/reports",
    "/accounts/import",
    "/accounts/export",
    "/reports/forecast",
  ];
  const seen = new Map<string, Record<string, unknown>>();
  for (const theme of ["light", "dark"] as const) {
    // Drop the session so /login renders its form, and pin the theme before
    // the first paint so the audit sees server-rendered colours.
    await page.context().clearCookies();
    await getDb().loginThrottle.deleteMany();
    await page
      .context()
      .addCookies([
        { name: "mynab-theme", value: theme, url: "https://127.0.0.1:3443" },
      ]);
    await page.goto(route("/login"));
    for (const h of (await page.evaluate(`(${AUDIT})()`)) as Record<
      string,
      unknown
    >[])
      seen.set(`${theme}|login|${h.cls}|${h.color}|${h.bg}`, {
        theme,
        path: "/login",
        ...h,
      });

    await signIn(page);
    await page.goto(route("/accounts"));
    const link = page.getByRole("link", { name: /Everyday Checking/ }).first();
    const register = (await link.count())
      ? await link.getAttribute("href")
      : null;
    for (const path of [...paths.map(route), ...(register ? [register] : [])]) {
      await page.goto(path);
      const hits = (await page.evaluate(`(${AUDIT})()`)) as Record<
        string,
        unknown
      >[];
      for (const h of hits)
        seen.set(`${theme}|${h.cls}|${h.color}|${h.bg}`, {
          theme,
          path,
          ...h,
        });
    }
  }
  for (const row of seen.values()) console.log(JSON.stringify(row));
  console.log(`TOTAL DISTINCT FAILURES: ${seen.size}`);
  expect([...seen.values()]).toEqual([]);
});
