import { useEffect, useRef } from 'react';

// Keep a page's data fresh without a manual refresh, cheaply:
//   • re-fetch when the browser tab regains focus / becomes visible again, and
//   • optionally poll on a light interval WHILE the tab is visible (polling is
//     PAUSED when the tab is hidden, so background tabs never hit the server).
//
// Auto-refreshes are deduped (min ~800ms apart) so the focus + visibility events
// that both fire on a tab-return don't double-fetch.
//
//   useLiveRefresh(() => refetch(), { pollMs: 20000 });
export function useLiveRefresh(onRefresh, { pollMs = 0, enabled = true } = {}) {
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const lastRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const run = () => {
      const now = Date.now();
      if (now - lastRef.current < 800) return; // dedupe rapid double-fires
      lastRef.current = now;
      cb.current();
    };

    let timer = null;
    const startPoll = () => {
      if (pollMs > 0 && timer == null) {
        timer = setInterval(() => {
          if (document.visibilityState === 'visible') { lastRef.current = Date.now(); cb.current(); }
        }, pollMs);
      }
    };
    const stopPoll = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { run(); startPoll(); }
      else stopPoll();
    };
    const onFocus = () => run();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    startPoll();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      stopPoll();
    };
  }, [pollMs, enabled]);
}

export default useLiveRefresh;
