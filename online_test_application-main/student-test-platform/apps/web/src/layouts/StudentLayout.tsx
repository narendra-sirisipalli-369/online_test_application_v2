import { ChevronRight, LogOut } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { AnimalAvatar } from '../components/AnimalAvatar';
import { useAuth } from '../context/AuthContext';

export function StudentLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="student-shell">
      <header className="student-topbar">
        <Link className="student-topbar__brand" to="/student">
          <img alt="Think Plus" className="student-topbar__logo" src="/thinkplus-logo.png" />
          <span className="student-topbar__product">Online Test Application</span>
        </Link>
        <div className="student-topbar__actions">
          <Link className="student-topbar__profile" to="/student/profile">
            <AnimalAvatar avatar={user?.avatar} size="sm" />
            <span className="student-topbar__profile-copy">
              <strong>{user?.name || 'Student'}</strong>
              <span>Profile</span>
            </span>
            <ChevronRight size={16} />
          </Link>
          <button aria-label="Sign out" className="student-topbar__logout" onClick={logout} type="button">
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="student-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
