"use client";
import * as Toggle from "@radix-ui/react-toggle";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
export function HideAmountsToggle({ initiallyHidden }: { initiallyHidden: boolean }) {
  const [hidden, setHidden] = useState(initiallyHidden);
  return (
    <Toggle.Root
      className="icon-button"
      aria-label="Hide amounts"
      pressed={hidden}
      onPressedChange={(next) => {
        setHidden(next);
        if (next) document.documentElement.dataset.hideAmounts = "";
        else delete document.documentElement.dataset.hideAmounts;
        document.cookie = `mynab-hide-amounts=${next ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      }}
    >
      {hidden ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
    </Toggle.Root>
  );
}
