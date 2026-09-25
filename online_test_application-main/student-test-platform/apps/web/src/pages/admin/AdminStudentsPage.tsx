import { useEffect, useState } from 'react';
import { Ban, CheckCircle2, Eye, Search, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import type { StudentSummary } from '../../types/app';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100';

export function AdminStudentsPage() {
  const { token } = useAuth();
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'blocked'>('all');
  const filteredStudents = students.filter((student) => {
    if (status === 'active' && student.isBlocked) return false;
    if (status === 'blocked' && !student.isBlocked) return false;
    return `${student.name} ${student.course || ''} ${student.mobileNumber || ''}`.toLowerCase().includes(search.toLowerCase());
  });

  function load() {
    if (!token) return;
    api.adminStudents(token)
      .then((response) => setStudents(response.students))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load students'));
  }

  useEffect(() => {
    load();
  }, [token]);

  async function toggleBlock(student: StudentSummary) {
    if (!token) return;
    setError('');
    setBusyId(student.id);
    try {
      await api.blockStudent(token, student.id, !student.isBlocked);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update this student');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(student: StudentSummary) {
    if (!token) return;
    if (!window.confirm(`Remove "${student.name}"? This permanently deletes their account and all test history.`)) {
      return;
    }
    setError('');
    setBusyId(student.id);
    try {
      await api.deleteStudent(token, student.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove this student');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        description="View every registered student, and block or remove accounts as needed."
        eyebrow="Admin workspace"
        title="Students"
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <section aria-label="Student filters" className="admin-list-toolbar">
        <div className="admin-list-toolbar__title"><span className="admin-list-toolbar__icon"><Users size={18} /></span><span><strong>Student directory</strong><small>{students.length} registered students</small></span></div>
        <div className="admin-list-toolbar__filters">
          <label className="admin-search-field"><Search size={16} /><span className="sr-only">Search students</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search students" value={search} /></label>
          <label className="admin-filter-field"><span className="sr-only">Filter by status</span><select onChange={(event) => setStatus(event.target.value as typeof status)} value={status}><option value="all">All students</option><option value="active">Active</option><option value="blocked">Blocked</option></select></label>
        </div>
      </section>

      {filteredStudents.length ? (
        <div className="table-wrap">
          <table className="data-table data-table--students">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Mobile</th>
                <th>Sessions</th>
                <th>Status</th>
                <th className="student-action-column">View</th>
                <th className="student-action-column">Block</th>
                <th className="student-action-column">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td>
                    <div className="student-row-identity">
                      {student.avatar ? (
                        <img alt="" className="avatar-chip avatar-chip--sm" src={`${API_BASE}${student.avatar.imageUrl}`} />
                      ) : (
                        <div className="avatar-chip avatar-chip--sm avatar-chip--placeholder">{student.name[0]?.toUpperCase()}</div>
                      )}
                      <strong>{student.name}</strong>
                    </div>
                  </td>
                  <td>{student.course || '—'}</td>
                  <td>{student.mobileNumber || '—'}</td>
                  <td>{student.sessionCount}</td>
                  <td><Badge tone={student.isBlocked ? 'bad' : 'good'} value={student.isBlocked ? 'Blocked' : 'Active'} /></td>
                  <td className="student-action-column">
                    <Link aria-label={`View ${student.name}'s history`} className="icon-button" title="View student history" to={`/admin/students/${student.id}`}>
                      <Eye size={15} />
                    </Link>
                  </td>
                  <td className="student-action-column">
                    <button
                      aria-label={`${student.isBlocked ? 'Unblock' : 'Block'} ${student.name}`}
                      className="icon-button"
                      disabled={busyId === student.id}
                      onClick={() => void toggleBlock(student)}
                      title={student.isBlocked ? 'Unblock student' : 'Block student'}
                      type="button"
                    >
                      {student.isBlocked ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                    </button>
                  </td>
                  <td className="student-action-column">
                    <button
                      aria-label={`Delete ${student.name}`}
                      className="icon-button student-action-icon--danger"
                      disabled={busyId === student.id}
                      onClick={() => void handleDelete(student)}
                      title="Delete student"
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state card">
          <Users size={26} />
          <strong>{students.length ? 'No matching students' : 'No students yet'}</strong>
          <p>{students.length ? 'Try a different name, course, or status.' : 'Students will appear here after they sign up.'}</p>
        </div>
      )}
    </div>
  );
}
