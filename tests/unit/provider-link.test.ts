import { describe, expect, it } from "vitest";
import { linkFailure } from "@/components/provider-link";

describe("Plaid Link exit message", () => {
  it("names the bank, Plaid's reason and code, the last step and the session", () => {
    expect(
      linkFailure(
        {
          error_code: "INSTITUTION_NOT_RESPONDING",
          display_message: "Citi is not responding right now",
        },
        { institution: { name: "Citibank Online" }, link_session_id: "abc-123" },
        "FAIL_OAUTH · Citibank Online",
      ),
    ).toBe(
      "Bank connection was not completed with Citibank Online. Citi is not responding right now (INSTITUTION_NOT_RESPONDING). Last step: FAIL_OAUTH · Citibank Online. Plaid session abc-123.",
    );
  });
  it("still says it did not complete when Link is simply closed", () => {
    expect(
      linkFailure(null, { status: "requires_oauth" }, "OPEN_OAUTH"),
    ).toBe(
      "Bank connection was not completed. Stopped at: requires_oauth. Last step: OPEN_OAUTH.",
    );
    expect(linkFailure(null, undefined, null)).toBe(
      "Bank connection was not completed.",
    );
  });
});
