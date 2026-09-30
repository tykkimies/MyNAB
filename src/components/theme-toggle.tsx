"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { selectedTheme, themeChrome, themes, type Theme } from "@/infrastructure/theme";

export function ThemePicker({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState(initialTheme);
  const [open, setOpen] = useState(false);
  const optionsId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  return (
    <div className="theme-menu" ref={container} data-open={open ? "" : undefined}>
      <button
        ref={trigger}
        type="button"
        className="theme-picker"
        aria-label={`Theme: ${themes.find((option) => option.id === theme)?.name}`}
        aria-expanded={open}
        aria-controls={optionsId}
        onClick={() => setOpen((current) => !current)}
      >
        {themes.find((option) => option.id === theme)?.name}
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div id={optionsId} className="theme-menu-panel" role="group" aria-label="Choose theme">
          {themes.map((option) => (
            <button
              key={option.id}
              type="button"
              className="theme-option"
              aria-pressed={theme === option.id}
              onClick={() => {
                const next = selectedTheme(option.id);
                setTheme(next);
                document.documentElement.dataset.theme = next;
                document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeChrome(next));
                document.cookie = `mynab-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span className="theme-swatch" style={{ backgroundColor: option.chrome }} aria-hidden />
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
