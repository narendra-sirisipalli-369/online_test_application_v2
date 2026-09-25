import { useEffect, useRef } from 'react';

/**
 * The countdown-triggered expiry check (useExpiryPoll) only fires once the
 * student's own local timer hits 0 — it never notices if an admin force-ends
 * the test early via "End Test", since that doesn't change the student's
 * deadline. This polls the session on a fixed interval regardless of the
 * countdown, so an early admin-triggered end (or any other server-side status
 * change) is picked up promptly.
 */
export function useSessionWatcher({
  enabled,
  intervalMs = 1500,
  onCheck,
}: {
  enabled: boolean;
  intervalMs?: number;
  onCheck: () => Promise<void>;
}) {
  const onCheckRef = useRef(onCheck);
  onCheckRef.current = onCheck;

  useEffect(() => {
    if (!enabled) return;
    void onCheckRef.current();
    const timer = window.setInterval(() => {
      void onCheckRef.current();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
}
