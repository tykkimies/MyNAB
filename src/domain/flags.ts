/** YNAB's six transaction flag colours. A flag is a label; it never moves money. */
export const FLAG_COLORS = [
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "BLUE",
  "PURPLE",
] as const;
export type FlagColor = (typeof FLAG_COLORS)[number];
export const FLAG_LABEL: Record<FlagColor, string> = {
  RED: "Red",
  ORANGE: "Orange",
  YELLOW: "Yellow",
  GREEN: "Green",
  BLUE: "Blue",
  PURPLE: "Purple",
};
/** The owner's name for a flag, falling back to its colour. */
export function flagName(
  color: FlagColor,
  names: readonly { color: string; name: string }[],
) {
  return names.find((n) => n.color === color)?.name || FLAG_LABEL[color];
}
