import { X } from 'lucide-react';
import { FloatingAvatarSpace } from './FloatingAvatarSpace';
import type { LobbyState } from '../types/app';

type LeaderboardRow = {
  studentId: string;
  studentName: string;
  scorePercent: number;
  correctCount: number;
  wrongCount: number;
  totalAnswerTimeSec: number;
};

type Props = {
  testTitle: string;
  lobby: LobbyState | null;
  leaderboard: LeaderboardRow[];
  unlocking: boolean;
  ending: boolean;
  onUnlock: () => void;
  onEndTest: () => void;
  onViewResults: () => void;
  onClose: () => void;
};

export function LiveRoomOverlay({ testTitle, lobby, leaderboard, unlocking, ending, onUnlock, onEndTest, onViewResults, onClose }: Props) {
  const unlocked = Boolean(lobby?.unlocked);
  const ended = Boolean(lobby?.ended);
  const waitingCount = lobby?.waitingStudents.length ?? 0;

  return (
    <div className="room-overlay">
      <div className="room-overlay__stars" />

      <button aria-label="Close room" className="room-overlay__close" onClick={onClose} type="button">
        <X size={20} />
      </button>

      <div className="room-overlay__header">
        <div className="room-overlay__title">{testTitle}</div>
        <div className="room-overlay__subtitle">
          {ended
            ? 'Test ended · final results ready'
            : unlocked
              ? 'Live · results updating in real time'
              : `Live · ${waitingCount} student${waitingCount === 1 ? '' : 's'} in the room`}
        </div>
      </div>

      {!unlocked && !ended ? (
        <>
          <FloatingAvatarSpace
            emptyLabel="Waiting for students to join…"
            students={lobby?.waitingStudents || []}
          />
          <div className="room-overlay__footer">
            <button className="primary-button room-overlay__unlock" disabled={unlocking} onClick={onUnlock} type="button">
              {unlocking ? 'Unlocking…' : `Unlock for ${waitingCount} student${waitingCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      ) : (
        <div className="room-overlay__results">
          <div className="room-overlay__results-head">
            <h2>{ended ? 'Final results' : 'Live results'}</h2>
            <div className="room-overlay__actions">
              <button className="ghost-button" onClick={onViewResults} type="button">View results</button>
              {!ended ? (
                <button className="primary-button room-overlay__unlock" disabled={ending} onClick={onEndTest} type="button">
                  {ending ? 'Ending…' : 'End test'}
                </button>
              ) : null}
            </div>
          </div>
          {leaderboard.length ? (
            <div className="table-wrap">
              <table className="data-table data-table--room">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Score</th>
                    <th>Correct / Wrong</th>
                    <th>Time (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, index) => (
                    <tr key={row.studentId}>
                      <td>{index + 1}</td>
                      <td>{row.studentName}</td>
                      <td>{row.scorePercent.toFixed(1)}%</td>
                      <td>{row.correctCount} / {row.wrongCount}</td>
                      <td>{row.totalAnswerTimeSec}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="room-overlay__empty-text">Results will appear here as students answer.</p>
          )}
        </div>
      )}
    </div>
  );
}
