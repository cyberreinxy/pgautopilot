import { OverlayScrollbars } from "overlayscrollbars";
import { SCROLLBAR_OPTIONS } from "./scrollbarOptions";

const MANAGED_ATTRIBUTE = "data-pg-os-managed";

function isManaged(element: HTMLElement): boolean {
  return (
    element.hasAttribute(MANAGED_ATTRIBUTE) || element.closest("[data-overlayscrollbars]") !== null
  );
}

function isScrollable(element: HTMLElement): boolean {
  if (element === document.documentElement || element === document.body) {
    return false;
  }
  const style = getComputedStyle(element);
  const vertical =
    (style.overflowY === "auto" || style.overflowY === "scroll") &&
    element.scrollHeight > element.clientHeight + 1;
  const horizontal =
    (style.overflowX === "auto" || style.overflowX === "scroll") &&
    element.scrollWidth > element.clientWidth + 1;
  return vertical || horizontal;
}

function initialize(element: HTMLElement): void {
  if (isManaged(element) || OverlayScrollbars(element) || !isScrollable(element)) {
    return;
  }
  OverlayScrollbars(element, SCROLLBAR_OPTIONS);
}

function destroyRemoved(element: HTMLElement): void {
  const hosts = [element, ...element.querySelectorAll<HTMLElement>("[data-overlayscrollbars]")];
  for (const host of hosts) {
    OverlayScrollbars(host)?.destroy();
  }
}

let observer: MutationObserver | null = null;

/**
 * Applies the shared overlay scrollbar theme to every scrollable element in the
 * app, including ones added later (route changes, dynamic content). Explicitly
 * managed scroll areas (the `ScrollArea` component) are skipped.
 */
export function initGlobalOverlayScrollbars(): () => void {
  observer?.disconnect();

  const target = document.body ?? document.documentElement;
  target.querySelectorAll<HTMLElement>("*").forEach(initialize);

  const pending = new Set<HTMLElement>();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as HTMLElement;
        pending.add(element);
        element.querySelectorAll<HTMLElement>("*").forEach((child) => pending.add(child));
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          pending.add(parent);
        }
      }
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        destroyRemoved(node as HTMLElement);
      }
    }
    if (pending.size > 0) {
      const batch = [...pending];
      pending.clear();
      requestAnimationFrame(() => batch.forEach(initialize));
    }
  });
  observer.observe(target, { childList: true, subtree: true });

  return () => observer?.disconnect();
}
