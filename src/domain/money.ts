/** USD integer cents only. Domain module: no framework or persistence imports. */
export type Money = bigint & { readonly __money: unique symbol };
const MIN = -(2n ** 63n);
const MAX = 2n ** 63n - 1n;
export function money(value: bigint): Money {
  if (value < MIN || value > MAX)
    throw new RangeError("Amount exceeds signed 64-bit cents");
  return value as Money;
}
export function fromMinorUnits(value: string): Money {
  if (!/^(0|-?[1-9]\d*)$/.test(value) || value.length > 20)
    throw new Error("Invalid integer cents");
  return money(BigInt(value));
}
export function toMinorUnits(value: Money): string {
  return value.toString();
}
export function parseUSD(value: string): Money {
  if (!/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) || value.length > 24)
    throw new Error("Invalid USD amount");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return money(
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
      (negative ? -1n : 1n),
  );
}
export function formatUSD(value: Money): string {
  const absolute = value < 0n ? -value : value;
  const dollars = (absolute / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0n ? "-" : ""}$${dollars}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
export function addMoney(a: Money, b: Money): Money {
  return money(a + b);
}
