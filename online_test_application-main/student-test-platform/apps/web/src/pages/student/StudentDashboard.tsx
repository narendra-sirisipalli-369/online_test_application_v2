import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Clock3, Sparkles, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Test } from '../../types/app';

function isAvailable(test: Test, now: number) {
  const end = new Date(test.scheduledEndAt).getTime();
  return test.status === 'PUBLISHED' && end >= now;
}

export function StudentDashboard() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<Test[]>([]);
  const [error, setError] = useState('');
  const [launchingTestId, setLaunchingTestId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    const authToken = token;

    let cancelled = false;
    async function refreshTests() {
      if (document.visibilityState === 'hidden') return;
      try {
        const testResponse = await api.studentTests(authToken);
        if (cancelled) return;
        setTests(testResponse.tests);
        setNow(Date.now());
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load tests');
      }
    }

    void refreshTests();
    const intervalId = window.setInterval(() => void refreshTests(), 2500 + Math.random() * 500);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshTests();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [token]);

  const availableTests = useMemo(
    () =>
      tests
        .filter((test) => isAvailable(test, now))
        .sort((left, right) => new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime()),
    [tests, now],
  );

  async function handleEnterRoom(test: Test) {
    if (!token) return;
    setLaunchingTestId(test.id);
    setError('');
    try {
      const response = await api.startTest(token, test.id);
      if (response.session.status === 'WAITING') {
        navigate(`/student/sessions/${response.session.id}/lobby`);
        return;
      }
      navigate(`/student/sessions/${response.session.id}/${response.session.test.mode === 'MOCK' ? 'answer' : 'reading'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter the room');
      setLaunchingTestId(null);
    }
  }

  return (
    <div className="student-home student-dashboard">
      <section className="student-home__hero">
        <div className="student-home__hero-copy">
          <span className="student-home__eyebrow">
            <Sparkles size={15} /> STUDENT PORTAL
          </span>
          <h1>Online Test Application</h1>
          <p>Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Find your available tests and enter a room when you are ready.</p>
          <div className="student-home__hero-actions">
            <a className="student-home__hero-primary" href="#available-tests">View tests <ArrowRight size={17} /></a>
            <Link className="student-home__hero-secondary" to="/student/profile">Your profile <UserRound size={16} /></Link>
          </div>
        </div>
        <div className="student-hero-art" aria-hidden="true">
          <span className="student-hero-art__orbit student-hero-art__orbit--outer" />
          <span className="student-hero-art__orbit student-hero-art__orbit--inner" />
          <span className="student-hero-art__planet" />
          <span className="student-hero-art__spark student-hero-art__spark--one" />
          <span className="student-hero-art__spark student-hero-art__spark--two" />
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="student-dashboard__summary">
        <div><BookOpen size={20} /><span><strong>{availableTests.length}</strong><small>Available assessments</small></span></div>
        <div><CalendarDays size={20} /><span><strong>{availableTests.filter((test) => new Date(test.scheduledStartAt).getTime() <= now).length}</strong><small>Open now</small></span></div>
        <Link to="/student/profile"><UserRound size={20} /><span><strong>{user?.name || 'Student'}</strong><small>View your profile</small></span><ArrowRight size={17} /></Link>
      </div>

      <div className="student-dashboard__section-heading" id="available-tests"><div><span>YOUR ASSESSMENTS</span><h2>Available tests</h2><p>Choose a test to enter its room.</p></div></div>

      {availableTests.length ? (
        <section className="student-test-grid">
          {availableTests.map((test) => (
            <article className="student-test-card" key={test.id}>
              <div className="student-test-card__top">
                <span className="student-pill">{test.mode === 'MOCK' ? `${test.mockExamType} Mock` : 'Sectional Test'}</span>
                <span className="student-test-card__window">
                  {new Date(test.scheduledStartAt).getTime() <= now ? 'Open now' : 'Open soon'}
                </span>
              </div>

              <div className="student-test-card__body">
                <h3>{test.title}</h3>
                {test.description ? <p>{test.description}</p> : <p>Enter when you are ready to begin.</p>}
              </div>

              <div className="student-test-card__meta">
                <div>
                  <CalendarDays size={16} />
                  <span>{new Date(test.scheduledStartAt).toLocaleDateString()}</span>
                </div>
                <div>
                  <Clock3 size={16} />
                  <span>{Math.floor(((test.mode === 'MOCK' ? 0 : test.readingDurationSec) + test.answerDurationSec) / 60)} mins</span>
                </div>
              </div>

              <button
                className="student-test-card__action"
                disabled={launchingTestId === test.id}
                onClick={() => void handleEnterRoom(test)}
                type="button"
              >
                {launchingTestId === test.id ? 'Entering...' : 'Enter test room'}
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </section>
      ) : (
        <section className="student-home__empty">
          <BookOpen size={28} aria-hidden="true" />
          <h2>No available tests yet</h2>
          <p>New assessments will appear here when they are published.</p>
        </section>
      )}
    </div>
  );
}
