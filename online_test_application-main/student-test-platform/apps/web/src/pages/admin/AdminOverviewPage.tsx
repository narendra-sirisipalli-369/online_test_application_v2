import { ArrowRight, BookOpen, CalendarDays, ChevronRight, ClipboardList, FileUp, Plus, Radio, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import type { Test } from '../../types/app';

export function AdminOverviewPage() {
  const { token, user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    Promise.all([api.adminDashboard(token), api.adminTests(token)])
      .then(([dashboard, testResponse]) => {
        setCounts(dashboard.counts);
        setTests(testResponse.tests);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load dashboard'))
      .finally(() => setLoading(false));
  }, [token]);

  const publishedCount = tests.filter((test) => test.status === 'PUBLISHED').length;
  const metrics = [
    { label: 'Total tests', value: counts.tests, icon: ClipboardList, to: '/admin/tests', color: 'violet' },
    { label: 'Live tests', value: publishedCount, icon: Radio, to: '/admin/room', color: 'pink' },
    { label: 'Questions', value: counts.questions, icon: BookOpen, to: '/admin/questions', color: 'orange' },
    { label: 'Students', value: counts.students, icon: Users, to: '/admin/students', color: 'blue' },
  ] as const;

  return (
    <div className="stack-lg admin-overview">
      <PageHeader
        description="Everything you need to prepare, publish, and monitor student tests."
        eyebrow="Dashboard"
        title={`Welcome back${user?.name ? `, ${user.name}` : ''}`}
      />
      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <section aria-label="Quick start" className="admin-hero">
        <div className="admin-hero__content">
          <span className="admin-hero__eyebrow"><span /> YOUR WORKSPACE</span>
          <h2>Make the next test count.</h2>
          <p>Build from your question banks, publish in a few steps, and follow progress as students complete the test.</p>
          <div className="admin-hero__actions">
            <Link className="admin-hero__primary" to="/admin/tests"><Plus size={17} /> Create a test</Link>
            <Link className="admin-hero__secondary" to="/admin/questions">Explore question banks <ArrowRight size={16} /></Link>
          </div>
        </div>
        <div aria-hidden="true" className="admin-hero__art">
          <div className="admin-hero__orbit admin-hero__orbit--one" />
          <div className="admin-hero__orbit admin-hero__orbit--two" />
          <div className="admin-hero__art-card"><span>✦</span><i /><i /><i /></div>
        </div>
      </section>

      <section aria-label="Workspace statistics" className="admin-metrics">
        {metrics.map(({ label, value, icon: Icon, to, color }) => (
          <Link className="admin-metric" key={label} to={to}>
            <span className={`admin-metric__icon admin-metric__icon--${color}`}><Icon size={20} strokeWidth={1.9} /></span>
            <span className="admin-metric__value">{loading ? '—' : value ?? 0}</span>
            <span className="admin-metric__label">{label}</span>
            <ChevronRight aria-hidden="true" className="admin-metric__arrow" size={17} />
          </Link>
        ))}
      </section>

      <div className="admin-overview__columns">
        <section className="card admin-overview__tests">
          <div className="admin-section-heading">
            <div><span className="eyebrow">At a glance</span><h2>Recent tests</h2><p>See what's ready and what's available to students.</p></div>
            <Link className="admin-text-link" to="/admin/tests">View all <ArrowRight size={16} /></Link>
          </div>
          {tests.length ? (
            <div className="admin-recent-list">
              {tests.slice(0, 5).map((test) => (
                <Link className="admin-recent-test" key={test.id} to="/admin/tests">
                  <span className="admin-recent-test__icon"><ClipboardList size={19} /></span>
                  <span className="admin-recent-test__copy">
                    <strong>{test.title}</strong>
                    <small><CalendarDays size={13} /> {test.scheduledStartAt ? new Date(test.scheduledStartAt).toLocaleDateString() : 'Not scheduled'} · {test.questions?.length || 0} questions</small>
                  </span>
                  <Badge value={test.status} />
                  <ChevronRight aria-hidden="true" size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="admin-overview__empty"><ClipboardList size={24} /><strong>No tests yet</strong><p>Create your first test to see it here.</p><Link to="/admin/tests">Create test <ArrowRight size={15} /></Link></div>
          )}
        </section>

        <section className="card admin-overview__shortcuts">
          <div className="admin-section-heading"><div><span className="eyebrow">Keep moving</span><h2>Quick actions</h2><p>Common tasks, one click away.</p></div></div>
          <Link to="/admin/create"><span className="admin-shortcut__icon admin-shortcut__icon--violet"><Plus size={18} /></span><span><strong>Create question bank</strong><small>Write and organize new questions</small></span><ArrowRight size={17} /></Link>
          <Link to="/admin/import"><span className="admin-shortcut__icon admin-shortcut__icon--orange"><FileUp size={18} /></span><span><strong>Import a DOCX</strong><small>Bring an existing paper into the bank</small></span><ArrowRight size={17} /></Link>
          <Link to="/admin/room"><span className="admin-shortcut__icon admin-shortcut__icon--pink"><Radio size={18} /></span><span><strong>Open live room</strong><small>Watch students join and progress</small></span><ArrowRight size={17} /></Link>
        </section>
      </div>
    </div>
  );
}
