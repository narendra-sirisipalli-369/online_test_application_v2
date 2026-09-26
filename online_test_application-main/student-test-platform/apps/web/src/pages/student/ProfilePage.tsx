import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, History, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { AnimalAvatar } from '../../components/AnimalAvatar';
import { AttemptQuestionReview } from '../../components/AttemptQuestionReview';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../context/AuthContext';
import type { Avatar, HistoryEntry, StudentHistoryQuestion } from '../../types/app';

const FINISHED_STATUSES = new Set(['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED']);

function computeStrength(password: string): 'weak' | 'medium' | 'strong' | null {
  if (!password) return null;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const variety = [hasLetter, hasNumber, hasSymbol].filter(Boolean).length;
  if (password.length >= 10 && variety >= 2) return 'strong';
  if (password.length >= 6 && variety >= 1) return 'medium';
  return 'weak';
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      <span>{label}</span>
      <div className="input-with-icon">
        <input
          autoComplete={autoComplete}
          minLength={4}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="input-with-icon__toggle"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

export function ProfilePage() {
  const { token, user, refreshUser } = useAuth();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [questionDetails, setQuestionDetails] = useState<Record<string, StudentHistoryQuestion[]>>({});
  const [questionPages, setQuestionPages] = useState<Record<string, number>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState('');

  useEffect(() => {
    api.listAvatars().then((response) => setAvatars(response.avatars)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token) return;
    const authToken = token;

    let cancelled = false;
    async function refreshProfile() {
      if (document.visibilityState === 'hidden') return;
      try {
        const [historyResponse] = await Promise.all([
          api.studentHistory(authToken),
          refreshUser(),
        ]);
        if (cancelled) return;
        setHistory(historyResponse.history);
      } catch {
        // Keep background polling quiet in the profile page.
      }
    }

    void refreshProfile();
    const intervalId = window.setInterval(() => void refreshProfile(), 3000 + Math.random() * 500);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshProfile();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshUser, token]);

  async function selectAvatar(avatarId: string) {
    if (!token || avatarId === user?.avatar?.id) return;
    setAvatarBusy(true);
    setAvatarError('');
    try {
      await api.updateAvatar(token, avatarId);
      await refreshUser();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Unable to update avatar');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setPasswordError('');
    setPasswordMessage('');
    setPasswordBusy(true);
    try {
      await api.updatePassword(token, { currentPassword, newPassword });
      setPasswordMessage('Password updated');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Unable to update password');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function toggleQuestionDetails(sessionId: string) {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);
    setDetailsError('');
    setQuestionPages((pages) => ({ ...pages, [sessionId]: pages[sessionId] || 1 }));
    if (!token || questionDetails[sessionId]) return;

    setDetailsLoadingId(sessionId);
    try {
      const response = await api.studentHistoryQuestions(token, sessionId);
      setQuestionDetails((details) => ({ ...details, [sessionId]: response.questions }));
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Unable to load your questions and answers');
    } finally {
      setDetailsLoadingId(null);
    }
  }

  const strength = computeStrength(newPassword);
  const historyPageSize = 5;
  const totalHistoryPages = Math.max(1, Math.ceil(history.length / historyPageSize));
  const visibleHistory = history.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, totalHistoryPages));
  }, [totalHistoryPages]);

  return (
    <div className="profile-stack student-profile">
      <Link className="student-profile__back" to="/student"><ArrowLeft size={16} /> Back to assessments</Link>
      <section className="student-profile__hero">
        <div className="student-profile__identity">
          <AnimalAvatar avatar={user?.avatar} size="lg" />
          <div><span className="student-profile__eyebrow">STUDENT PROFILE</span><h1>{user?.name || 'Your profile'}</h1><p>{user?.course || 'Online Test Application student'}</p></div>
        </div>
        <span className="student-profile__hero-orbit" aria-hidden="true" />
      </section>

      <div className="student-profile__grid">
        <section className="profile-stack__card student-profile__avatar-card">
          <div className="student-profile__panel-head"><div><span>YOUR IDENTITY</span><h2>Choose your avatar</h2><p>Select an image for your profile and the live test room.</p></div><UserRound size={22} /></div>
          {avatarError ? <div className="error-banner">{avatarError}</div> : null}
          <div className="avatar-orb-grid student-profile__avatar-grid">
            {avatars.map((avatar) => {
              const active = user?.avatar?.id === avatar.id;
              return (
                <button
                  aria-pressed={active}
                  className={`avatar-orb-pick avatar-orb-pick--space ${active ? 'active' : ''}`}
                  disabled={avatarBusy}
                  key={avatar.id}
                  onClick={() => void selectAvatar(avatar.id)}
                  type="button"
                >
                  <span className="avatar-orb avatar-orb--space">
                    <AnimalAvatar avatar={avatar} size="md" />
                    {active ? <span className="avatar-orb__check"><Check size={12} /></span> : null}
                  </span>
                  <span className="avatar-orb-pick__name">{avatar.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="profile-stack__card student-profile__security-card">
          <div className="student-profile__panel-head"><div><span>ACCOUNT SECURITY</span><h2>Password</h2><p>Keep your account secure with a strong password.</p></div><ShieldCheck size={22} /></div>
          {passwordMessage ? <div className="success-banner">{passwordMessage}</div> : null}
          {passwordError ? <div className="error-banner">{passwordError}</div> : null}
          <form className="stack narrow-form profile-stack__form" onSubmit={changePassword}>
            <PasswordField autoComplete="current-password" label="Current password" onChange={setCurrentPassword} value={currentPassword} />
            <div>
              <PasswordField autoComplete="new-password" label="New password" onChange={setNewPassword} value={newPassword} />
              {strength ? (
                <div className="password-strength">
                  <div className={`password-strength__bar ${strength === 'weak' || strength === 'medium' || strength === 'strong' ? `filled-${strength}` : ''}`} />
                  <div className={`password-strength__bar ${strength === 'medium' || strength === 'strong' ? `filled-${strength}` : ''}`} />
                  <div className={`password-strength__bar ${strength === 'strong' ? `filled-${strength}` : ''}`} />
                </div>
              ) : null}
            </div>
            <button className="primary-button" disabled={passwordBusy} type="submit">
              {passwordBusy ? 'Updating…' : 'Save new password'}
            </button>
          </form>
          <div className="student-profile__security-note"><KeyRound size={17} /><span>Your password is required whenever you sign in.</span></div>
        </section>
      </div>

      <section className="profile-stack__history-card">
        <div className="student-profile__panel-head"><div><span>YOUR PROGRESS</span><h2>Test history</h2><p>Review completed assessments and released results.</p></div><History size={22} /></div>
        {history.length ? (
          <>
            <div className="profile-stack__history-list">
              {visibleHistory.map((entry) => {
                const questions = questionDetails[entry.sessionId] || [];
                const questionPageSize = 5;
                const questionPageCount = Math.max(1, Math.ceil(questions.length / questionPageSize));
                const questionPage = Math.min(questionPages[entry.sessionId] || 1, questionPageCount);
                const visibleQuestions = questions.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize);
                const expanded = expandedSessionId === entry.sessionId;

                return (
                  <article className={`profile-stack__history-item ${expanded ? 'profile-stack__history-item--expanded' : ''}`} key={entry.sessionId}>
                    <div className="profile-stack__history-summary-row">
                      <div>
                        <strong>{entry.testTitle}</strong>
                        <span>{entry.submittedAt ? new Date(entry.submittedAt).toLocaleDateString() : 'Awaiting submission'}</span>
                      </div>
                      <div className="profile-stack__history-meta">
                        <span className="profile-stack__history-status">{entry.status.replaceAll('_', ' ')}</span>
                        <span>{FINISHED_STATUSES.has(entry.status) ? `${entry.scorePercent.toFixed(0)}%` : '—'}</span>
                        {entry.canReviewAnswers ? <Link to={`/student/sessions/${entry.sessionId}/result`}>Result</Link> : null}
                        {entry.canReviewAnswers && entry.totalSelectedCount ? (
                          <button aria-expanded={expanded} className="student-history-answer-toggle" onClick={() => void toggleQuestionDetails(entry.sessionId)} type="button">
                            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            {expanded ? 'Hide answers' : 'View answers'}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {expanded ? (
                      <section aria-label={`Questions and answers for ${entry.testTitle}`} className="student-history-answers student-history-answers--profile">
                        <div className="student-history-answers__heading">
                          <div><span>Your attempt</span><h4>Questions and answers</h4></div>
                          {questions.length ? <strong>{questions.length} questions</strong> : null}
                        </div>
                        {detailsLoadingId === entry.sessionId ? <div className="history-answers-status">Loading questions and answers…</div> : null}
                        {detailsError && detailsLoadingId !== entry.sessionId && !questions.length ? <div className="error-banner">{detailsError}</div> : null}
                        {visibleQuestions.map((question) => <AttemptQuestionReview key={question.id} question={question} />)}
                        {!detailsLoadingId && !detailsError && !questions.length ? <div className="history-answers-status">No selected questions were recorded for this attempt.</div> : null}
                        <Pagination
                          currentPage={questionPage}
                          itemLabel="questions"
                          onPageChange={(nextPage) => setQuestionPages((pages) => ({ ...pages, [entry.sessionId]: nextPage }))}
                          pageSize={questionPageSize}
                          totalItems={questions.length}
                          totalPages={questionPageCount}
                        />
                      </section>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <div className="profile-stack__pager">
              <button className="ghost-button" disabled={historyPage === 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} type="button">
                <ChevronLeft size={16} /> Previous
              </button>
              <span>Page {historyPage} of {totalHistoryPages}</span>
              <button className="ghost-button" disabled={historyPage === totalHistoryPages} onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))} type="button">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <p className="profile-stack__empty-text">No completed tests yet. Your results will appear here.</p>
        )}
      </section>
    </div>
  );
}
