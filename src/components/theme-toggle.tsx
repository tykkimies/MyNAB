"use client";
import { useState } from "react";
import { selectedTheme, themeChrome, themes, type Theme } from "@/infrastructure/theme";

export function ThemePicker({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState(initialTheme);
  return (
    <select
      className="theme-picker"
      aria-label="Theme"
      value={theme}
      onChange={(event) => {
        const next = selectedTheme(event.target.value);
        setTheme(next);
        document.documentElement.dataset.theme = next;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeChrome(next));
        document.cookie = `mynab-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      }}
    >
      {themes.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  );
}
