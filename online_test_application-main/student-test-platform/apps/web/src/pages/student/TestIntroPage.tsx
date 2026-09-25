import { useEffect, useState } from 'react';
import { Clock, FileQuestion, Target } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Test } from '../../types/app';

export function TestIntroPage() {
  const { testId = '' } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.studentTests(token)
      .then((response) => {
        const match = response.tests.find((item) => item.id === testId);
        if (!match) {
          setError('This test is not available.');
          return;
        }
        setTest(match);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load test'));
  }, [testId, token]);

  async function handleStart() {
    if (!token || !test) return;
    setStarting(true);
    setError('');
    try {
      const response = await api.startTest(token, test.id);
      if (response.session.status === 'WAITING') {
        navigate(`/student/sessions/${response.session.id}/lobby`);
      } else {
        navigate(`/student/sessions/${response.session.id}/${response.session.test.mode === 'MOCK' ? 'answer' : 'reading'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start test');
      setStarting(false);
    }
  }

  if (error && !test) {
    return (
      <div className="page-shell narrow">
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  return (
    <div className="page-shell narrow stack-lg student-intro">
      <div>
        <div className="eyebrow">ONLINE TEST APPLICATION · ASSESSMENT</div>
        <h1>{test?.title || 'Loading…'}</h1>
        {test?.description ? <p className="muted-text" style={{ marginTop: 4 }}>{test.description}</p> : null}
      </div>

      {test ? (
        <>
          <section className="card">
            <div className="test-meta-grid" style={{ borderTop: 0, paddingTop: 0 }}>
              <div className="test-meta-block">
                <FileQuestion color="var(--brand-purple)" size={20} />
                <strong>{test.questionCount}</strong>
                <span>Questions</span>
              </div>
              <div className="test-meta-block">
                <Clock color="var(--brand-purple)" size={20} />
                <strong>{Math.floor(((test.mode === 'MOCK' ? 0 : test.readingDurationSec) + test.answerDurationSec) / 60)} min</strong>
                <span>Total time</span>
              </div>
              <div className="test-meta-block">
                <Target color="var(--brand-purple)" size={20} />
                <strong>{test.mode === 'MOCK' ? test.questionCount : `${test.thresholdCount} / ${test.questionCount}`}</strong>
                <span>{test.mode === 'MOCK' ? 'Questions to answer' : 'Minimum score'}</span>
              </div>
            </div>
          </section>

          {test.mode === 'SECTIONAL' ? <section className="card stack">
            <h3>Sections</h3>
            <div className="stack" style={{ gap: 8 }}>
              <div className="test-row">
                <div>
                  <strong>01 &nbsp; Reading</strong>
                  <p className="muted-text text-small">Skim every question and choose which ones you'll answer.</p>
                </div>
                <span className="badge badge--neutral">{Math.floor(test.readingDurationSec / 60)} min</span>
              </div>
              <div className="test-row">
                <div>
                  <strong>02 &nbsp; Answering</strong>
                  <p className="muted-text text-small">Answer only the questions you selected during reading.</p>
                </div>
                <span className="badge badge--neutral">{Math.floor(test.answerDurationSec / 60)} min</span>
              </div>
            </div>
          </section> : <section className="card stack">
            <h3>{test.mockStructure?.label || test.mockExamType} mock structure</h3>
            {test.mockStructure?.sections.map((section, index) => (
              <div className="test-row" key={section.name}>
                <div><strong>{String(index + 1).padStart(2, '0')} &nbsp; {section.name}</strong><p className="muted-text text-small">{section.questions} questions</p></div>
                <span className="badge badge--neutral">{test.mockStructure?.sectionTimed ? `${section.minutes} min` : 'Shared 120 min'}</span>
              </div>
            ))}
            <p className="muted-text text-small">{test.mockStructure?.sectionTimed ? 'Sections are presented in exam order.' : 'You can move between subjects freely during the shared test timer.'}</p>
          </section>}

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="topbar">
            <button className="ghost-button" onClick={() => navigate('/student')} type="button">Back</button>
            <button className="primary-button" disabled={starting} onClick={() => void handleStart()} type="button">
              {starting ? 'Starting…' : 'Start test'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
