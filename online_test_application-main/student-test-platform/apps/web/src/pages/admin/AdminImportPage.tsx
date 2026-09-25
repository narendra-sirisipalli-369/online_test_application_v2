import { useState } from 'react';
import { ArrowRight, CheckCircle2, FileSpreadsheet, FileText, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import type { ExtractionIssue } from '../../types/app';

export function AdminImportPage() {
  const { token } = useAuth();
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [issues, setIssues] = useState<ExtractionIssue[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function importDocx(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !docxFile) return;
    setError('');
    setMessage('');
    setIssues([]);
    setDocumentId(null);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', docxFile);
    try {
      const response = await api.uploadDocx(token, formData);
      setIssues(response.issues);
      setDocumentId(response.document.id);
      setMessage(`Imported ${response.questions.length} questions. Review them in the Question bank.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  }

  async function downloadExcel() {
    if (!token || !documentId) return;
    setError('');
    setDownloading(true);
    try {
      const blob = await api.exportImportedDocument(token, documentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'extracted_questions.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download Excel file');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        description="Bring new questions in from a DOCX paper."
        eyebrow="Admin workspace"
        title="Import"
      />

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="card stack admin-import-card">
        <div className="admin-section-heading"><div><span className="eyebrow">Upload paper</span><h2>Import a DOCX file</h2><p>We extract the questions and create a bank for you to review.</p></div><span className="admin-import-card__icon"><FileText size={21} /></span></div>
        <form className="stack" onSubmit={importDocx}>
          <label className="admin-upload">
            <input accept=".docx" onChange={(event) => setDocxFile(event.target.files?.[0] || null)} type="file" />
            <span className="admin-upload__icon"><UploadCloud size={26} /></span>
            <strong>{docxFile ? docxFile.name : 'Choose a DOCX paper'}</strong>
            <small>{docxFile ? `${(docxFile.size / 1024).toFixed(1)} KB selected` : 'Click to browse your files · DOCX format'}</small>
          </label>
          <button className="primary-button" disabled={!docxFile || uploading} type="submit">{uploading ? 'Importing questions…' : 'Upload and import questions'} <ArrowRight size={16} /></button>
        </form>

        {documentId ? (
          <button className="ghost-button" disabled={downloading} onClick={() => void downloadExcel()} type="button">
            <FileSpreadsheet size={16} /> {downloading ? 'Preparing…' : 'Download extracted data as Excel'}
          </button>
        ) : null}

        {documentId ? <Link className="admin-import__review" to="/admin/questions"><CheckCircle2 size={17} /> Import complete — review the new bank <ArrowRight size={15} /></Link> : null}

        {issues.length ? (
          <div className="stack">
            <h3>Extraction issues ({issues.length})</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Question #</th>
                    <th>Issue type</th>
                    <th>Detected value</th>
                    <th>Suggested fix</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue, index) => (
                    <tr key={`${issue.section}-${issue.question_number ?? issue.question_index ?? index}-${index}`}>
                      <td>{issue.section}</td>
                      <td>{issue.question_number ?? '—'}</td>
                      <td>{issue.issue_type}</td>
                      <td>{issue.detected_value || '—'}</td>
                      <td>{issue.suggested_fix || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      <aside className="admin-import-note"><strong>What happens next?</strong><span>Open the new question bank, review extracted answers and images, then approve the questions before including them in a test.</span></aside>
    </div>
  );
}
