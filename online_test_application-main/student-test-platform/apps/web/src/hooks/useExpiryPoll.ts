import { useEffect, useRef } from 'react';

type PollResult = 'pending' | 'resolved';

/**
 * When a client-side countdown hits 0, the server's own deadline may not have
 * passed yet (clock drift, network latency) — a single one-shot check right
 * at 0 can land just before the server considers the phase expired, and the
 * countdown then sits frozen at 0 with nothing re-checking. This retries
 * `onCheck` every 1.5s (up to ~30s) until it reports the phase actually moved
 * on, instead of checking exactly once.
 */
export function useExpiryPoll({
  remaining,
  deadlineIso,
  enabled,
  onCheck,
}: {
  remaining: number;
  deadlineIso?: string | null;
  enabled: boolean;
  onCheck: () => Promise<PollResult>;
}) {
  const onCheckRef = useRef(onCheck);
  onCheckRef.current = onCheck;

  useEffect(() => {
    if (remaining !== 0 || !deadlineIso || !enabled) return;

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    const maxAttempts = 20;

    const poll = () => {
      if (cancelled) return;
      onCheckRef.current()
        .then((result) => {
          if (cancelled || result === 'resolved') return;
          attempts += 1;
          if (attempts < maxAttempts) {
            timer = window.setTimeout(poll, 1500);
          }
        })
        .catch(() => undefined);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [remaining, deadlineIso, enabled]);
}
