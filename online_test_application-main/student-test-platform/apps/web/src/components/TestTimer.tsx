import { Clock } from 'lucide-react';

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function TestTimer({ remainingSeconds, totalSeconds }: { remainingSeconds: number; totalSeconds: number }) {
  const ratio = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;
  let tone: 'normal' | 'warning' | 'critical' = 'normal';
  if (remainingSeconds <= 30 || ratio <= 0.1) {
    tone = 'critical';
  } else if (ratio <= 0.25) {
    tone = 'warning';
  }

  return (
    <div aria-live="polite" className={`test-timer test-timer--${tone}`}>
      <Clock size={16} />
      {formatTime(remainingSeconds)} remaining
    </div>
  );
}
