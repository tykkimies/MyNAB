import "../database-env";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const route = (path: string) => `${process.env.APP_BASE_PATH ?? ""}${path}`;
const ROUTES = [
  "/budget",
  "/accounts",
  "/accounts/connections",
  "/accounts/schedules",
  "/accounts/rules",
  "/accounts/register",
  "/accounts/payees",
  "/accounts/import",
  "/accounts/export",
  "/targets",
  "/debt",
  "/reports",
  "/reports?tab=trends",
  "/reports?tab=worth",
  "/reports?tab=income",
  "/reports?tab=age",
  "/reports?tab=cashflow",
  "/reports?tab=budget",
  "/reports?tab=paychecks",
  "/reports?tab=paychecks&view=spending",
  "/reports/forecast",
  "/plans",
  "/household",
  "/guide",
  "/add",
];

/**
 * Automated WCAG 2.1 A/AA checks on every page, in both themes, after the
 * other suites have filled the ledger. Automated checks find a subset of
 * problems; they do not replace keyboard and screen-reader review.
 */
test("every page passes automated WCAG 2.1 AA checks in every theme", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto(route("/login"));
  const login = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const problems: string[] = login.violations.map(
    (v) =>
      `/login [light] ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
  );
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page
    .getByLabel("Passphrase", { exact: true })
    .fill("synthetic-e2e-passphrase-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  const { origin } = new URL(page.url());
  for (const theme of ["light", "dark", "parchment", "forest", "ocean", "plum"]) {
    await page
      .context()
      .addCookies([{ name: "mynab-theme", value: theme, url: origin }]);
    for (const path of ROUTES) {
      await page.goto(route(path));
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      for (const v of result.violations)
        problems.push(
          `${path} [${theme}] ${v.id} (${v.impact}): ${v.nodes
            .slice(0, 4)
            .map((n) => n.target.join(" "))
            .join(" | ")}`,
        );
    }
  }
  console.log(`A11Y VIOLATIONS: ${problems.length}\n${problems.join("\n")}`);
  expect(problems).toEqual([]);
});
