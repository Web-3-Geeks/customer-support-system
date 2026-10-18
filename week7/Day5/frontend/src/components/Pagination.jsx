import Button from "./Button";

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.total === 0) return null;

  const { page, limit, total, pages } = pagination;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted" aria-live="polite">
        Showing {first}-{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="px-3 py-1.5" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="px-2 font-medium text-ink">
          Page {page} of {pages}
        </span>
        <Button variant="ghost" className="px-3 py-1.5" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

export default Pagination;
