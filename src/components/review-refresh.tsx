"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Layouts persist across navigation; refresh their bank-import counts without polling. */
export function ReviewRefresh() {
  const path = usePathname();
  const previous = useRef(path);
  const router = useRouter();
  useEffect(() => {
    if (previous.current !== path) {
      previous.current = path;
      router.refresh();
    }
  }, [path, router]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [router]);
  return null;
}
