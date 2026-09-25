type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE_BY_VALUE: Record<string, Tone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'good',
  CLOSED: 'neutral',
  ARCHIVED: 'neutral',
  PENDING: 'warn',
  CORRECT: 'good',
  APPROVED: 'good',
  NEEDS_EDIT: 'warn',
  INVALID: 'bad',
  NOT_STARTED: 'neutral',
  READING: 'info',
  ANSWERING: 'info',
  SUBMITTED: 'good',
  AUTO_SUBMITTED: 'warn',
  EXPIRED: 'bad',
};

export function Badge({ value, tone }: { value: string; tone?: Tone }) {
  const resolvedTone = tone || TONE_BY_VALUE[value] || 'neutral';
  return <span className={`badge badge--${resolvedTone}`}>{value.replace(/_/g, ' ')}</span>;
}
