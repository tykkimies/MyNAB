"use client";

import { useEffect, useRef, useState } from "react";
import { Amount } from "@/components/amount";
import { Notice } from "@/components/ui/notice";
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
  const figure = (gap: bigint) => (
    <strong className="text-num text-lg">
      <Amount>{formatUSD(money(gap))}</Amount>
    </strong>
  );
  return (
    <div ref={ref} aria-live="polite">
      {assist.status === "whole" && (
        <Notice tone="positive" className="split-assist">
          Uses the whole amount.
        </Notice>
      )}
      {assist.status === "left" && (
        <Notice tone="warning" className="split-assist">
          {figure(assist.gap)} left to split
        </Notice>
      )}
      {assist.status === "over" && (
        <Notice tone="negative" className="split-assist">
          {figure(assist.gap)} too much
        </Notice>
      )}
      {assist.status === "sign" && (
        <Notice tone="negative" className="split-assist">
          Splits must use the same sign as the amount.
        </Notice>
      )}
    </div>
  );
}
