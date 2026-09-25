import { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, Search, Star } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import type { ReviewRatingEntry } from '../../types/app';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100';

type ReviewSummary = {
  total: number;
  writtenReviewCount: number;
  averageRating: number | null;
  fiveStarCount: number;
};

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="muted-text">Not rated</span>;
  return (
    <span aria-label={`${rating} out of 5 stars`} className="admin-rating-stars">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star fill={value <= rating ? 'currentColor' : 'none'} key={value} size={16} />
      ))}
      <strong>{rating}.0</strong>
    </span>
  );
}

export function AdminReviewsPage() {
  const { token } = useAuth();
  const [reviews, setReviews] = useState<ReviewRatingEntry[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({ total: 0, writtenReviewCount: 0, averageRating: null, fiveStarCount: 0 });
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api.adminReviewsRatings(token)
      .then((response) => {
        setReviews(response.reviews);
        setSummary(response.summary);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load reviews and ratings'))
      .finally(() => setLoading(false));
  }, [token]);

  const filteredReviews = useMemo(() => reviews.filter((review) => {
    if (ratingFilter !== 'all' && review.rating !== Number(ratingFilter)) return false;
    const searchable = `${review.student.name} ${review.student.course || ''} ${review.test.title} ${review.review || ''}`.toLowerCase();
    return searchable.includes(search.trim().toLowerCase());
  }), [ratingFilter, reviews, search]);

  return (
    <div className="stack-lg admin-reviews-page">
      <PageHeader
        description="Read student feedback and track ratings across every completed test."
        eyebrow="Student feedback"
        title="Reviews & ratings"
      />

      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <section aria-label="Feedback summary" className="review-summary-grid">
        <article><span>Total feedback</span><strong>{loading ? '—' : summary.total}</strong></article>
        <article><span>Average rating</span><strong>{loading ? '—' : summary.averageRating == null ? '—' : `${summary.averageRating.toFixed(1)} / 5`}</strong></article>
        <article><span>Written reviews</span><strong>{loading ? '—' : summary.writtenReviewCount}</strong></article>
        <article><span>Five-star ratings</span><strong>{loading ? '—' : summary.fiveStarCount}</strong></article>
      </section>

      <section aria-label="Review filters" className="admin-list-toolbar">
        <div className="admin-list-toolbar__title">
          <span className="admin-list-toolbar__icon"><MessageSquareText size={18} /></span>
          <span><strong>Student responses</strong><small>{filteredReviews.length} of {reviews.length} shown</small></span>
        </div>
        <div className="admin-list-toolbar__filters">
          <label className="admin-search-field">
            <Search size={16} />
            <span className="sr-only">Search feedback</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Search student, test, or review" value={search} />
          </label>
          <label className="admin-filter-field">
            <span className="sr-only">Filter by rating</span>
            <select onChange={(event) => setRatingFilter(event.target.value)} value={ratingFilter}>
              <option value="all">All ratings</option>
              {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}
            </select>
          </label>
        </div>
      </section>

      {loading ? <div className="page-loader">Loading feedback…</div> : null}

      {!loading && filteredReviews.length ? (
        <div className="review-response-list">
          {filteredReviews.map((review) => (
            <article className="card review-response-card" key={review.id}>
              <div className="review-response-card__header">
                <div className="student-row-identity">
                  {review.student.avatar ? (
                    <img alt="" className="avatar-chip avatar-chip--sm" src={`${API_BASE}${review.student.avatar.imageUrl}`} />
                  ) : (
                    <div className="avatar-chip avatar-chip--sm avatar-chip--placeholder">{review.student.name[0]?.toUpperCase()}</div>
                  )}
                  <span><strong>{review.student.name}</strong><small>{review.student.course || 'Student'}</small></span>
                </div>
                <RatingStars rating={review.rating} />
              </div>
              <div className="review-response-card__meta">
                <strong>{review.test.title}</strong>
                <span>{new Date(review.submittedAt).toLocaleString()}</span>
              </div>
              <p className={review.review ? '' : 'muted-text'}>{review.review || 'This student submitted a rating without a written review.'}</p>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && !filteredReviews.length ? (
        <div className="card admin-reviews-empty">
          <MessageSquareText size={28} />
          <strong>{reviews.length ? 'No feedback matches these filters' : 'No reviews or ratings yet'}</strong>
          <p>{reviews.length ? 'Try a different student, test, or rating.' : 'Student feedback will appear here after it is submitted.'}</p>
        </div>
      ) : null}
    </div>
  );
}
