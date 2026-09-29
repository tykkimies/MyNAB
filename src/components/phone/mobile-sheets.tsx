"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Phone-only modal behavior shared by URL drawers and native details menus. */
export function MobileSheets() {
  const router = useRouter();
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let current: HTMLElement | null = null;
    const scan = () => {
      const panels = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".drawer, details.popover[open] > .popover-panel",
        ),
      );
      const sheet =
        panels.findLast((p) => p.matches(".popover-panel")) ??
        panels.at(-1) ??
        null;
      if (sheet === current) return;
      const entering = !current || sheet?.matches(".popover-panel");
      cleanup?.();
      cleanup = undefined;
      current = sheet;
      if (!sheet) return;
      const opener = document.activeElement as HTMLElement | null;
      const details = sheet.closest<HTMLDetailsElement>("details.popover");
      const backdrop = document.createElement("div");
      backdrop.className = "phone-sheet-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      // Share the panel’s stacking context, including when a menu is inside a drawer.
      sheet.before(backdrop);
      const viewport = window.visualViewport;
      const sizeToViewport = () => {
        sheet.style.setProperty(
          "--phone-sheet-viewport",
          `${viewport?.height ?? window.innerHeight}px`,
        );
        sheet.style.setProperty(
          "--phone-sheet-bottom",
          `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`,
        );
      };
      sizeToViewport();
      viewport?.addEventListener("resize", sizeToViewport);
      viewport?.addEventListener("scroll", sizeToViewport);
      const oldRole = sheet.getAttribute("role");
      const oldLabel = sheet.getAttribute("aria-label");
      const oldTabIndex = sheet.getAttribute("tabindex");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      if (
        !sheet.hasAttribute("aria-labelledby") &&
        !sheet.hasAttribute("aria-label")
      ) {
        sheet.setAttribute(
          "aria-label",
          details?.querySelector("summary")?.getAttribute("aria-label") ??
            "Menu",
        );
      }
      sheet.tabIndex = -1;
      const inert: HTMLElement[] = [];
      for (
        let node: HTMLElement | null = sheet;
        node?.parentElement;
        node = node.parentElement
      ) {
        for (const sibling of node.parentElement.children) {
          if (
            sibling !== node &&
            sibling !== backdrop &&
            sibling instanceof HTMLElement &&
            !sibling.inert
          ) {
            sibling.inert = true;
            inert.push(sibling);
          }
        }
      }
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 0 : 250;
      const animations: Animation[] = [];
      const animate = (
        element: HTMLElement,
        frames: Keyframe[],
        ms = duration,
      ) => {
        const animation = element.animate(frames, {
          duration: ms,
          easing: "cubic-bezier(.2,.8,.2,1)",
          fill: "forwards",
        });
        animations.push(animation);
        // Even an animation ending at `none` can retain an identity matrix.
        // Release it so fixed descendants use the viewport after settling.
        if (frames.at(-1)?.transform === "none") {
          void animation.finished.then(() => {
            element.style.transform = "";
            animation.cancel();
          }, () => {});
        }
        return animation;
      };
      if (entering) {
        animate(sheet, [{ transform: "translateY(100%)" }, { transform: "none" }]);
        animate(backdrop, [{ opacity: 0 }, { opacity: 1 }]);
      }
      const heading = sheet.querySelector<HTMLElement>("h2");
      const oldHeadingTabIndex = heading?.getAttribute("tabindex") ?? null;
      if (heading) heading.tabIndex = -1;
      (heading ?? sheet).focus({ preventScroll: true });
      let closing = false;
      let disposed = false;
      const dismiss = async () => {
        if (closing) return;
        closing = true;
        animate(backdrop, [{ opacity: 1 }, { opacity: 0 }]);
        await animate(sheet, [
          { transform: getComputedStyle(sheet).transform },
          { transform: "translateY(100%)" },
        ]).finished.catch(() => {});
        if (disposed) return;
        if (details) details.open = false;
        else if (sheet.dataset.closeHref)
          router.push(sheet.dataset.closeHref, { scroll: false });
      };
      backdrop.addEventListener("click", dismiss);
      const focusables = () =>
        Array.from(
          sheet.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, summary, [tabindex="0"]',
          ),
        ).filter(
          (e) => !e.matches(":disabled") && e.getClientRects().length > 0,
        );
      const key = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          void dismiss();
        } else if (event.key === "Tab") {
          const items = focusables();
          const first = items[0],
            last = items.at(-1);
          if (!first) {
            event.preventDefault();
            sheet.focus();
          } else if (
            event.shiftKey &&
            (document.activeElement === first ||
              !items.includes(document.activeElement as HTMLElement))
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              !items.includes(document.activeElement as HTMLElement))
          ) {
            event.preventDefault();
            first.focus();
          }
        }
      };
      const click = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-sheet-close]")) {
          event.preventDefault();
          event.stopPropagation();
          void dismiss();
        }
      };
      let gesture: {
        x: number;
        y: number;
        time: number;
        dy: number;
        dragging: boolean;
      } | null = null;
      const start = (event: TouchEvent) => {
        if (closing || event.touches.length !== 1) return;
        const target = event.target as HTMLElement;
        if (
          target.closest(
            "a, button, input, textarea, select, summary, label, [role=button]",
          )
        )
          return;
        const header = target.closest(
          ".phone-sheet-handle, .drawer > header, .popover-content > h2",
        );
        for (
          let node: HTMLElement | null = target;
          !header && node && sheet.contains(node);
          node = node.parentElement
        ) {
          if (node.scrollTop > 0) return;
        }
        const touch = event.touches[0];
        gesture = {
          x: touch.clientX,
          y: touch.clientY,
          time: performance.now(),
          dy: 0,
          dragging: false,
        };
      };
      const move = (event: TouchEvent) => {
        if (!gesture) return;
        if (event.touches.length !== 1) {
          gesture = null;
          animate(sheet, [{ transform: getComputedStyle(sheet).transform }, { transform: "none" }]);
          return;
        }
        const touch = event.touches[0];
        const dy = touch.clientY - gesture.y,
          dx = touch.clientX - gesture.x;
        if (!gesture.dragging && (dy < -8 || Math.abs(dx) > Math.max(8, dy))) {
          gesture = null;
          return;
        }
        if (dy > 8 || gesture.dragging) {
          event.preventDefault();
          if (!gesture.dragging) {
            animations.forEach((a) => a.cancel());
            backdrop.style.opacity = "1";
          }
          gesture.dragging = true;
          gesture.dy = Math.max(0, dy);
          sheet.style.transform = `translateY(${gesture.dy}px)`;
        }
      };
      const end = (event: TouchEvent) => {
        if (!gesture) return;
        const { dy, time, dragging } = gesture;
        gesture = null;
        if (!dragging) return;
        event.preventDefault();
        event.stopPropagation();
        if (
          event.type !== "touchcancel" &&
          (dy >= 80 || (dy >= 20 && dy / (performance.now() - time) > 0.5))
        )
          void dismiss();
        else
          animate(sheet, [
            { transform: `translateY(${dy}px)` },
            { transform: "none" },
          ]);
      };
      document.addEventListener("keydown", key, true);
      sheet.addEventListener("click", click);
      sheet.addEventListener("touchstart", start, { passive: true });
      sheet.addEventListener("touchmove", move, { passive: false });
      sheet.addEventListener("touchend", end, { passive: false });
      sheet.addEventListener("touchcancel", end, { passive: false });
      cleanup = () => {
        disposed = true;
        animations.forEach((a) => a.cancel());
        backdrop.remove();
        viewport?.removeEventListener("resize", sizeToViewport);
        viewport?.removeEventListener("scroll", sizeToViewport);
        sheet.style.removeProperty("--phone-sheet-viewport");
        sheet.style.removeProperty("--phone-sheet-bottom");
        inert.forEach((e) => {
          e.inert = false;
        });
        document.body.style.overflow = overflow;
        sheet.style.transform = "";
        sheet.removeAttribute("aria-modal");
        if (oldLabel === null) sheet.removeAttribute("aria-label");
        else sheet.setAttribute("aria-label", oldLabel);
        if (oldTabIndex === null) sheet.removeAttribute("tabindex");
        else sheet.setAttribute("tabindex", oldTabIndex);
        if (heading) {
          if (oldHeadingTabIndex === null) heading.removeAttribute("tabindex");
          else heading.setAttribute("tabindex", oldHeadingTabIndex);
        }
        if (oldRole) sheet.setAttribute("role", oldRole);
        else sheet.removeAttribute("role");
        document.removeEventListener("keydown", key, true);
        sheet.removeEventListener("click", click);
        sheet.removeEventListener("touchstart", start);
        sheet.removeEventListener("touchmove", move);
        sheet.removeEventListener("touchend", end);
        sheet.removeEventListener("touchcancel", end);
        const restore =
          details?.querySelector<HTMLElement>("summary") ?? opener;
        if (restore?.isConnected && !restore.closest("[inert]"))
          restore.focus({ preventScroll: true });
      };
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    scan();
    return () => {
      observer.disconnect();
      cleanup?.();
    };
  }, [router]);
  return null;
}
