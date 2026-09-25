import { useEffect, useState } from 'react';
import { BookOpen, FileText, Search, Trash2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../context/AuthContext';
import type { BankSummary } from '../../types/app';

export function AdminQuestionBankListPage() {
  const { token } = useAuth();
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'manual' | 'imported'>('all');
  const [page, setPage] = useState(1);
  const filteredBanks = banks.filter((bank) => {
    if (typeFilter !== 'all' && bank.type.toLowerCase() !== typeFilter) return false;
    return bank.name.toLowerCase().includes(search.toLowerCase());
  });
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filteredBanks.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleBanks = filteredBanks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function load() {
    if (!token) return;
    api.adminBanks(token)
      .then((response) => setBanks(response.banks))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load question banks'));
  }

  useEffect(() => {
    load();
  }, [token]);

  async function handleDelete(event: React.MouseEvent, bank: BankSummary) {
    event.preventDefault();
    event.stopPropagation();
    if (!token) return;
    if (!window.confirm(`Delete "${bank.name}"? This removes all ${bank.questionCount} question(s) in it and cannot be undone.`)) {
      return;
    }
    setError('');
    setDeletingId(bank.id);
    try {
      await api.deleteBank(token, bank.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete this bank');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        actions={(
          <div className="toolbar">
            <Link className="ghost-button" to="/admin/import"><Upload size={16} /> Import DOCX</Link>
            <Link className="primary-button" to="/admin/create">Create question bank</Link>
          </div>
        )}
        description="Each import or manually created set is its own bank. Open one to review its questions."
        eyebrow="Admin workspace"
        title="Question banks"
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <section aria-label="Question bank filters" className="admin-list-toolbar">
        <div className="admin-list-toolbar__title"><span className="admin-list-toolbar__icon"><BookOpen size={18} /></span><span><strong>All banks</strong><small>{banks.length} question banks</small></span></div>
        <div className="admin-list-toolbar__filters">
          <label className="admin-search-field"><Search size={16} /><span className="sr-only">Search banks</span><input onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search banks" value={search} /></label>
          <label className="admin-filter-field"><span className="sr-only">Filter by bank type</span><select onChange={(event) => { setTypeFilter(event.target.value as typeof typeFilter); setPage(1); }} value={typeFilter}><option value="all">All types</option><option value="manual">Manual</option><option value="imported">Imported</option></select></label>
        </div>
      </section>

      {filteredBanks.length ? (
        <div className="bank-grid">
          {visibleBanks.map((bank) => (
            <Link className="bank-tile" key={bank.id} to={`/admin/questions/${bank.id}`}>
              <div className="bank-tile__icon"><FileText size={20} /></div>
              <div className="bank-tile__body">
                <div className="bank-tile__name">{bank.name}</div>
                <span className="muted-text text-small">{bank.questionCount} question{bank.questionCount === 1 ? '' : 's'}</span>
              </div>
              <Badge tone={bank.type === 'IMPORTED' ? 'info' : 'neutral'} value={bank.mockExamType ? `${bank.mockExamType} mock` : bank.type === 'IMPORTED' ? 'Imported' : 'Manual'} />
              <button
                aria-label={`Delete ${bank.name}`}
                className="icon-button-plain bank-tile__delete"
                disabled={deletingId === bank.id}
                onClick={(event) => void handleDelete(event, bank)}
                title="Delete this bank"
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state card">
          <BookOpen size={26} />
          <strong>{banks.length ? 'No matching banks' : 'No question banks yet'}</strong>
          <p>{banks.length ? 'Try a different name or bank type.' : 'Import a DOCX or create one by hand to get started.'}</p>
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        itemLabel="question banks"
        onPageChange={setPage}
        pageSize={pageSize}
        totalItems={filteredBanks.length}
        totalPages={pageCount}
      />
    </div>
  );
}
