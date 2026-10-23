/** Scroll the shared module pane, leaving the fixed Dashboard ancestors untouched. */
export function scrollOverviewTarget(target: HTMLElement | null) {
  if (!target) return;
  const pane = target.closest<HTMLElement>(".fm-monitor-detail");
  if (pane) {
    const scope = pane.querySelector<HTMLElement>(".fm-monitor-scope");
    const style = scope ? getComputedStyle(scope) : null;
    // Reserve only the visible sticky area; narrow layouts use static filters.
    const stickyHeight = scope && style?.position === "sticky"
      ? scope.getBoundingClientRect().height + Math.max(0, (parseFloat(getComputedStyle(pane).paddingTop) || 0) + (parseFloat(style.top) || 0))
      : 0;
    pane.scrollTo({
      top: pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientTop - stickyHeight - 16,
      behavior: "instant",
    });
  }
  target.focus({ preventScroll: true });
}
