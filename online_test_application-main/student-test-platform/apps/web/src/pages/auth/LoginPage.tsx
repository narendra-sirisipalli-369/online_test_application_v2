import { Lock, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function LoginPage() {
  const { login, logout, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const signedInUser = await login(name, password);
      navigate(signedInUser.role === 'ADMIN' ? '/admin' : '/student');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <img alt="Think Plus" className="auth-shell__logo" src="/thinkplus-logo.png" />

      <div className="auth-card-wrap">
        <div className="auth-card">
          <section className="auth-panel">
            <span className="auth-panel__product-name">Online Test Application</span>
            <h1 className="auth-panel__eyebrow">Welcome</h1>
            <p className="auth-panel__quote">Read fast. Pick smart. Answer sharp.</p>
            {user ? (
              <div className="card stack">
                <p className="muted-text">Signed in as <strong>{user.name}</strong> ({user.role}).</p>
                <p className="muted-text">Sign out to log in with a different account.</p>
                <div className="topbar">
                  <button className="ghost-button" onClick={logout} type="button">Sign out</button>
                  <button className="primary-button" onClick={() => navigate(user.role === 'ADMIN' ? '/admin' : '/student')} type="button">
                    Continue
                  </button>
                </div>
              </div>
            ) : (
            <form className="card stack" onSubmit={handleSubmit}>
              <label>
                <span>Name</span>
                <div className="auth-input-group">
                  <User size={18} />
                  <input onChange={(event) => setName(event.target.value)} placeholder="Name" required value={name} />
                </div>
              </label>
              <label>
                <span>Password</span>
                <div className="auth-input-group">
                  <Lock size={18} />
                  <input onChange={(event) => setPassword(event.target.value)} placeholder="Password" required type="password" value={password} />
                </div>
              </label>
              {error ? <div className="error-banner">{error}</div> : null}
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? 'Signing in...' : 'Sign in'}
              </button>
              <p className="muted-text">
                New student? <Link to="/signup">Create an account</Link>
              </p>
            </form>
            )}
          </section>

          <aside className="auth-illustration">
            <img alt="" className="auth-illustration__image" src="/auth-illustration.png" />
          </aside>
        </div>
      </div>
    </div>
  );
}
