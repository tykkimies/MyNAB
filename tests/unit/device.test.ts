import { describe, expect, it } from "vitest";
import { phoneDevice, phonePage, resolveView } from "@/infrastructure/device";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("phone detection", () => {
  it("treats iPhones and Android phones as phones", () => {
    expect(phoneDevice({ userAgent: IPHONE })).toBe(true);
    expect(phoneDevice({ userAgent: ANDROID_PHONE })).toBe(true);
  });
  it("gives iPads, Android tablets and desktops the desktop site", () => {
    expect(phoneDevice({ userAgent: IPAD })).toBe(false);
    expect(phoneDevice({ userAgent: ANDROID_TABLET })).toBe(false);
    expect(phoneDevice({ userAgent: DESKTOP })).toBe(false);
    expect(phoneDevice({})).toBe(false);
  });
  it("trusts the mobile client hint", () => {
    expect(phoneDevice({ userAgent: DESKTOP, chMobile: "?1" })).toBe(true);
    expect(phoneDevice({ userAgent: IPHONE, chMobile: "?0" })).toBe(true);
  });
  it("lets the switch cookie override the device", () => {
    expect(resolveView({ userAgent: IPHONE, cookie: "desktop" })).toBe(
      "desktop",
    );
    expect(resolveView({ userAgent: DESKTOP, cookie: "phone" })).toBe("phone");
    expect(resolveView({ userAgent: IPHONE, cookie: "junk" })).toBe("phone");
    expect(resolveView({ userAgent: DESKTOP })).toBe("desktop");
  });
});

describe("phone pages", () => {
  it("allows the phone areas and one account's register", () => {
    for (const path of [
      "/budget",
      "/accounts",
      "/accounts/register",
      "/accounts/5b0c9f1e-0000-4000-8000-000000000000",
      "/add",
      "/debt",
      "/reports",
    ])
      expect(phonePage(path), path).toBe(true);
  });
  it("keeps the management pages on the desktop site", () => {
    for (const path of [
      "/targets",
      "/plans",
      "/household",
      "/guide",
      "/reports/forecast",
      "/accounts/rules",
      "/accounts/schedules",
      "/accounts/connections",
      "/accounts/import",
      "/accounts/export",
      "/accounts/payees",
      "/accounts/x/reconcile",
    ])
      expect(phonePage(path), path).toBe(false);
  });
});
