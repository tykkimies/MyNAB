"use client";

import { useEffect, useRef, useState } from "react";
import { Amount } from "@/components/amount";
import { formatUSD, money } from "@/domain/money";
import { splitAssist, type SplitAssist } from "@/domain/split-assist";

function read(form: HTMLFormElement) {
  const total = form.elements.namedItem("amount");
  const categories = [...form.querySelectorAll<HTMLSelectElement>('[name="splitCategory"]')];
  const amounts = [...form.querySelectorAll<HTMLInputElement>('[name="splitAmount"]')];
  return splitAssist(
    total instanceof HTMLInputElement ? total.value : "",
    categories.map((category, i) => ({
      categoryId: category.value,
      amount: amounts[i]?.value ?? "",
    })),
  );
}

export function SplitAssist() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [assist, setAssist] = useState<SplitAssist>({ status: "empty" });
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const update = () => setAssist(read(form));
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, []);
  const tone = assist.status === "over" || assist.status === "sign" ? "text-negative" : "text-ink-2";
  return (
    <p ref={ref} className={`text-meta ${tone}`} aria-live="polite">
      {assist.status === "whole" && "Uses the whole amount."}
      {assist.status === "left" && (
        <>
          <Amount>{formatUSD(money(assist.gap))}</Amount> left to split
        </>
      )}
      {assist.status === "over" && (
        <>
          <Amount>{formatUSD(money(assist.gap))}</Amount> too much
        </>
      )}
      {assist.status === "sign" && "Splits must use the same sign as the amount."}
    </p>
  );
}
