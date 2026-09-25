import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  currentPage: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

function pageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const visible = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...visible].filter((page) => page > 0 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) result.push('ellipsis');
    result.push(page);
  });

  return result;
}

export function Pagination({ currentPage, itemLabel, onPageChange, pageSize, totalItems, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;

  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <nav aria-label={`${itemLabel} pagination`} className="pagination-bar">
      <span className="pagination-bar__summary">
        Showing <strong>{firstItem}–{lastItem}</strong> of <strong>{totalItems}</strong> {itemLabel}
      </span>
      <div className="pagination-bar__controls">
        <button
          aria-label="Previous page"
          className="pagination-bar__arrow"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          <ChevronLeft size={17} />
        </button>
        {pageNumbers(currentPage, totalPages).map((page, index) => page === 'ellipsis' ? (
          <span aria-hidden="true" className="pagination-bar__ellipsis" key={`ellipsis-${index}`}>…</span>
        ) : (
          <button
            aria-current={page === currentPage ? 'page' : undefined}
            aria-label={`Page ${page}`}
            className={`pagination-bar__page ${page === currentPage ? 'pagination-bar__page--active' : ''}`}
            key={page}
            onClick={() => onPageChange(page)}
            type="button"
          >
            {page}
          </button>
        ))}
        <button
          aria-label="Next page"
          className="pagination-bar__arrow"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}
