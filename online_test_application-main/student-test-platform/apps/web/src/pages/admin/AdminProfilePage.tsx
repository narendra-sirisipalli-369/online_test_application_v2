import { useState } from 'react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';

export function AdminProfilePage() {
  const { user, token, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api.updateProfile(token!, {
        name: name !== user?.name ? name : undefined,
        currentPassword,
        newPassword: newPassword || undefined,
      });
      await refreshUser();
      setCurrentPassword('');
      setNewPassword('');
      setSuccess('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        description="Update your admin name or password."
        eyebrow="Admin workspace"
        title="Profile"
      />

      <div className="admin-detail-layout">
      <form className="card stack admin-profile-form" onSubmit={handleSubmit}>
        <label>
          <span>Name</span>
          <input onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label>
          <span>Current password</span>
          <input onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
        </label>
        <label>
          <span>New password (optional)</span>
          <input onChange={(event) => setNewPassword(event.target.value)} placeholder="Leave blank to keep current password" type="password" value={newPassword} />
        </label>
        {error ? <div className="error-banner">{error}</div> : null}
        {success ? <div className="success-banner">{success}</div> : null}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </form>
      <aside className="card admin-detail-aside"><h3>Account details</h3><p>Your profile name appears throughout the admin workspace. Enter your current password to save any change.</p></aside>
      </div>
    </div>
  );
}
