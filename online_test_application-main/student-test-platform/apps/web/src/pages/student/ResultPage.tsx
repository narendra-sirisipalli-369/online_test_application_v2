import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Send, Star } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { TestSession } from '../../types/app';

type Summary = {
  selectionCount: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  scorePercent: number;
};

type ReviewStatus = 'correct' | 'incorrect' | 'skipped';

function TestFeedback({
  sessionId,
  initialRating,
  initialReview,
  feedbackSubmittedAt,
}: {
  sessionId: string;
  initialRating?: number | null;
  initialReview?: string | null;
  feedbackSubmittedAt?: string | null;
}) {
  const { token } = useAuth();
  const [rating, setRating] = useState(initialRating || 0);
  const [review, setReview] = useState(initialReview || '');
  const [hoverRating, setHoverRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(Boolean(initialReview || feedbackSubmittedAt));

  function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saving || !rating || review.trim().length < 3) return;
    setSaving(true);
    setError('');
    api.submitFeedback(token, sessionId, { rating, review: review.trim() })
      .then((response) => {
        setRating(response.rating);
        setReview(response.review);
        setSubmitted(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to save your feedback'))
      .finally(() => setSaving(false));
  }

  if (submitted) {
    return (
      <section className="card stack test-feedback test-feedback--submitted">
        <div>
          <h3>Your rating and review</h3>
          <p className="muted-text">Feedback can be submitted once for each test.</p>
        </div>
        <div aria-label={`${rating} out of 5 stars`} className="review-stars__row">
          {[1, 2, 3, 4, 5].map((value) => (
            <Star className={value <= rating ? 'review-stars__button--filled' : ''} fill={value <= rating ? 'currentColor' : 'none'} key={value} size={27} />
          ))}
        </div>
        <blockquote className="test-feedback__submitted-review">{review}</blockquote>
        <p className="success-banner">Thank you—your feedback was submitted successfully.</p>
      </section>
    );
  }

  return (
    <section className="card stack test-feedback">
      <div>
        <h3>Rate and review this test</h3>
        <p className="muted-text">Your feedback helps us improve future tests.</p>
      </div>
      <form className="stack test-feedback__form" onSubmit={submitFeedback}>
        <div>
          <span className="test-feedback__label">Your rating</span>
          <div className="review-stars__row" role="radiogroup" aria-label="Rate this test out of 5 stars">
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = value <= (hoverRating || rating);
              return (
                <button
                  aria-checked={value === rating}
                  aria-label={`${value} star${value > 1 ? 's' : ''}`}
                  className={`review-stars__button${filled ? ' review-stars__button--filled' : ''}`}
                  disabled={saving}
                  key={value}
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHoverRating(value)}
                  onMouseLeave={() => setHoverRating(0)}
                  role="radio"
                  type="button"
                >
                  <Star fill={filled ? 'currentColor' : 'none'} size={30} />
                </button>
              );
            })}
          </div>
        </div>
        <label className="test-feedback__review">
          <span className="test-feedback__label">Your review</span>
          <textarea
            disabled={saving}
            maxLength={2000}
            onChange={(event) => setReview(event.target.value)}
            placeholder="Tell us what worked well and what we can improve…"
            rows={5}
            value={review}
          />
          <small>{review.length}/2000 characters</small>
        </label>
        <button className="primary-button test-feedback__submit" disabled={saving || !rating || review.trim().length < 3} type="submit">
          <Send size={16} /> {saving ? 'Submitting…' : 'Submit feedback'}
        </button>
      </form>
      {error ? <p className="error-banner">{error}</p> : null}
    </section>
  );
}

export function ResultPage() {
  const { sessionId = '' } = useParams();
  const { token } = useAuth();
  const [session, setSession] = useState<TestSession | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.sessionResult(token, sessionId)
      .then((response) => {
        setSession(response.session);
        setSummary(response.summary as unknown as Summary | null);
      })
      .catch((err) => {
        setHidden(err instanceof Error && err.message.toLowerCase().includes('hidden'));
        setError(err.message);
      });
  }, [sessionId, token]);

  if (error) {
    return (
      <div className="page-shell narrow">
        <div className={hidden ? 'success-banner' : 'error-banner'}>
          {hidden ? 'Your submission was recorded. Results will be shown once they are released.' : error}
        </div>
        <Link className="ghost-button" style={{ display: 'inline-flex', marginTop: 16 }} to="/student">Back to tests</Link>
      </div>
    );
  }

  if (!session) {
    return <div className="page-loader">Loading result…</div>;
  }

  const review: ReviewStatus[] = session.selections.map((questionId) => {
    const answer = session.answers.find((item) => item.questionId === questionId);
    if (!answer) return 'skipped';
    return answer.isCorrect ? 'correct' : 'incorrect';
  });
  const skippedCount = review.filter((status) => status === 'skipped').length;

  return (
    <div className="page-shell narrow stack-lg result-page">
      <div>
        <div className="eyebrow">Mission report</div>
        <h1>{session.test.title}</h1>
      </div>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Score</span>
          <strong className="accent-purple">{summary ? `${summary.scorePercent.toFixed(0)}%` : '—'}</strong>
        </article>
        <article className="stat-card">
          <span>Correct</span>
          <strong className="accent-success">{session.correctCount}</strong>
        </article>
        <article className="stat-card">
          <span>Incorrect</span>
          <strong className="accent-error">{session.wrongCount}</strong>
        </article>
        <article className="stat-card">
          <span>Skipped</span>
          <strong>{skippedCount}</strong>
        </article>
      </section>

      {review.length ? (
        <section className="card stack">
          <h3>Signal log</h3>
          <div className="review-grid">
            {review.map((status, index) => (
              <div className={`review-chip review-chip--${status}`} key={index}>
                <strong>Q{String(index + 1).padStart(2, '0')}</strong>
                <span>{status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Incorrect' : 'Skipped'}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {session.status === 'SUBMITTED' || session.status === 'AUTO_SUBMITTED' ? (
        <TestFeedback
          feedbackSubmittedAt={session.feedbackSubmittedAt}
          initialRating={session.rating}
          initialReview={session.studentReview}
          sessionId={sessionId}
        />
      ) : null}

      <div className="topbar">
        <Link className="ghost-button" to="/student">Back to tests</Link>
        <Link className="ghost-button" to="/student/profile">View history</Link>
      </div>
    </div>
  );
}
