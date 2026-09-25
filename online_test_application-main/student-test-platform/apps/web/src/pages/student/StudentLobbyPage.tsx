import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { FloatingAvatarSpace } from '../../components/FloatingAvatarSpace';
import { useAuth } from '../../context/AuthContext';
import type { LobbyState } from '../../types/app';

export function StudentLobbyPage() {
  const { sessionId = '' } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [testTitle, setTestTitle] = useState('');
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !sessionId) return;
    let cancelled = false;

    async function poll() {
      try {
        const sessionResponse = await api.getSession(token!, sessionId);
        if (cancelled) return;
        setTestTitle(sessionResponse.session.test.title);

        if (sessionResponse.session.status === 'SUBMITTED' || sessionResponse.session.status === 'AUTO_SUBMITTED') {
          navigate(`/student/sessions/${sessionId}/result`, { replace: true });
          return;
        }

        if (sessionResponse.session.status !== 'WAITING') {
          navigate(`/student/sessions/${sessionId}/${sessionResponse.session.test.mode === 'MOCK' ? 'answer' : 'reading'}`, { replace: true });
          return;
        }

        const lobbyResponse = await api.waitingRoom(token!, sessionResponse.session.test.id);
        if (!cancelled) setLobby(lobbyResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the waiting room');
      }
    }

    void poll();
    const intervalId = window.setInterval(() => void poll(), 2500 + Math.random() * 500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token, sessionId, navigate]);

  const waitingCount = lobby?.waitingStudents.length ?? 0;

  return (
    <div className="room-overlay">
      <div className="room-overlay__stars" />

      <div className="room-overlay__header">
        <div className="room-overlay__title">{testTitle || 'Get ready…'}</div>
        <div className="room-overlay__subtitle">
          {lobby ? `${waitingCount} student${waitingCount === 1 ? '' : 's'} in the room — your teacher will start the test for everyone at once.` : 'Loading…'}
        </div>
      </div>

      {error ? <div className="error-banner" style={{ maxWidth: 480 }}>{error}</div> : null}

      <FloatingAvatarSpace
        emptyLabel="You're the first one here — waiting for others to join…"
        students={lobby?.waitingStudents || []}
      />
    </div>
  );
}
