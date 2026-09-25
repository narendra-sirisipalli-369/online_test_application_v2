import { BookOpen, Check, Lock, Phone, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { AnimalAvatar } from '../../components/AnimalAvatar';
import { useAuth } from '../../context/AuthContext';
import type { Avatar } from '../../types/app';

export function SignupPage() {
  const { signup, logout, user, token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'details' | 'avatar'>('details');
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [avatarsError, setAvatarsError] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [course, setCourse] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role === 'STUDENT' && !user.avatar) setStep('avatar');
  }, [user]);

  useEffect(() => {
    if (step !== 'avatar') return;
    api.listAvatars()
      .then((response) => {
        setAvatars(response.avatars);
        if (!response.avatars.length) setAvatarsError('No avatars are available right now. Please try again later.');
      })
      .catch(() => setAvatarsError('Unable to load avatars. Refresh the page to try again.'))
      .finally(() => setAvatarsLoading(false));
  }, [step]);

  async function handleDetailsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signup(name, password, course, mobileNumber);
      setStep('avatar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  }

  async function chooseAvatar() {
    if (!token || !selectedAvatarId) return;
    setAvatarBusy(true);
    setError('');
    try {
      await api.updateAvatar(token, selectedAvatarId);
      await refreshUser();
      navigate('/student');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set avatar');
    } finally {
      setAvatarBusy(false);
    }
  }

  const selectedAvatar = avatars.find((avatar) => avatar.id === selectedAvatarId);

  return (
    <div className="auth-shell auth-shell--signup">
      <img alt="Think Plus" className="auth-shell__logo" src="/thinkplus-logo.png" />

      <div className={`auth-card-wrap auth-card-wrap--signup ${step === 'avatar' ? 'auth-card-wrap--avatar' : ''}`}>
        <div className="auth-card auth-card--signup">
          <section className="auth-panel auth-panel--signup">
            <span className="auth-panel__product-name">Online Test Application</span>
            <span className="signup-step">Step {step === 'details' ? '1' : '2'} of 2</span>
            <h1 className="auth-panel__eyebrow">{step === 'details' ? 'Create your account' : 'Choose your avatar'}</h1>
            <p className="auth-panel__quote">{step === 'details' ? 'Get ready for your next test.' : 'Make your profile yours. You can change your avatar later.'}</p>
            {user && step === 'details' ? (
              <div className="card stack">
                <p className="muted-text">Signed in as <strong>{user.name}</strong> ({user.role}).</p>
                <p className="muted-text">Sign out to create a different account.</p>
                <div className="topbar">
                  <button className="ghost-button" onClick={logout} type="button">Sign out</button>
                  <button className="primary-button" onClick={() => navigate(user.role === 'ADMIN' ? '/admin' : '/student')} type="button">
                    Continue
                  </button>
                </div>
              </div>
            ) : step === 'details' ? (
              <form className="card stack" onSubmit={handleDetailsSubmit}>
                <label>
                  <span>Name</span>
                  <div className="auth-input-group">
                    <User size={18} />
                    <input aria-describedby={error.includes('name is already in use') ? 'signup-name-error' : undefined} aria-invalid={error.includes('name is already in use')} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="Name" required value={name} />
                  </div>
                </label>
                <label>
                  <span>Password</span>
                  <div className="auth-input-group">
                    <Lock size={18} />
                    <input onChange={(event) => setPassword(event.target.value)} placeholder="Password" required type="password" value={password} />
                  </div>
                </label>
                <label>
                  <span>Course</span>
                  <div className="auth-input-group">
                    <BookOpen size={18} />
                    <input onChange={(event) => setCourse(event.target.value)} placeholder="Course" required value={course} />
                  </div>
                </label>
                <label>
                  <span>Mobile number</span>
                  <div className="auth-input-group">
                    <Phone size={18} />
                    <input onChange={(event) => setMobileNumber(event.target.value)} placeholder="Mobile number" required type="tel" value={mobileNumber} />
                  </div>
                </label>
                {error ? <div className="error-banner" id={error.includes('name is already in use') ? 'signup-name-error' : undefined} role="alert">{error}</div> : null}
                <button className="primary-button" disabled={busy} type="submit">
                  {busy ? 'Creating...' : 'Continue'}
                </button>
                <p className="muted-text">
                  Already have an account? <Link to="/login">Sign in</Link>
                </p>
              </form>
            ) : (
              <div className="signup-avatar-step">
                {error ? <div className="error-banner" role="alert">{error}</div> : null}
                {avatarsLoading ? <p className="signup-avatar-step__status" role="status">Loading avatars…</p> : null}
                {avatarsError ? <p className="signup-avatar-step__status" role="alert">{avatarsError}</p> : null}
                <div aria-label="Choose an avatar" className="signup-avatar-grid">
                  {avatars.map((avatar) => {
                    const selected = avatar.id === selectedAvatarId;
                    return (
                      <button
                        aria-pressed={selected}
                        className={`signup-avatar-card ${selected ? 'signup-avatar-card--selected' : ''}`}
                        disabled={avatarBusy}
                        key={avatar.id}
                        onClick={() => setSelectedAvatarId(avatar.id)}
                        type="button"
                      >
                        <span className="signup-avatar-card__check"><Check size={15} strokeWidth={3} /></span>
                        <span className="signup-avatar-card__image"><AnimalAvatar avatar={avatar} size="md" /></span>
                        <span className="signup-avatar-card__name">{avatar.name}</span>
                      </button>
                    );
                  })}
                </div>
                {avatars.length ? (
                  <div className="signup-avatar-footer">
                    <p>{selectedAvatar ? <><strong>{selectedAvatar.name}</strong> selected</> : 'Select an avatar to continue'}</p>
                    <button className="primary-button" disabled={!selectedAvatarId || avatarBusy} onClick={() => void chooseAvatar()} type="button">
                      {avatarBusy ? 'Saving avatar…' : 'Continue to dashboard'}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
          {step === 'details' ? (
            <aside className="auth-illustration">
              <img alt="" className="auth-illustration__image" src="/auth-illustration.png" />
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
