export const themes = [
  { id: "light", name: "Light", chrome: "#f4f5f7" },
  { id: "dark", name: "Dark", chrome: "#111316" },
  { id: "parchment", name: "Parchment", chrome: "#f5efe3" },
  { id: "forest", name: "Forest", chrome: "#102019" },
  { id: "ocean", name: "Ocean", chrome: "#101d2e" },
  { id: "plum", name: "Plum", chrome: "#f5f0f7" },
] as const;

export type Theme = (typeof themes)[number]["id"];

export function selectedTheme(value: string | undefined): Theme {
  return themes.find((theme) => theme.id === value)?.id ?? "light";
}

export function themeChrome(theme: Theme): string {
  return themes.find((option) => option.id === theme)!.chrome;
}
