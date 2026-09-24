"use client";
import * as Toggle from "@radix-ui/react-toggle";
import { Moon, Sun } from "lucide-react";
import { useState } from "react";
export function ThemeToggle({ initiallyDark }: { initiallyDark: boolean }) {
  const [dark, setDark] = useState(initiallyDark);
  return (
    <Toggle.Root
      className="grid h-8 w-8 place-items-center rounded-md bg-surface-container text-text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
      aria-label="Dark theme"
      pressed={dark}
      onPressedChange={(next) => {
        setDark(next);
        document.documentElement.dataset.theme = next ? "dark" : "light";
        document.cookie = `mynab-theme=${next ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      }}
    >
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </Toggle.Root>
  );
}
