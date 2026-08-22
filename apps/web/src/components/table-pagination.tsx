import { Button } from "@/components/ui/button";

export const TABLE_PAGE_SIZE = 15;

export function TablePagination({ page, pageCount, total, shown, onPage }: { page: number; pageCount: number; total: number; shown: number; onPage: (page: number) => void }) {
  if (total === 0) return null;
  const first = (page - 1) * TABLE_PAGE_SIZE + 1;
  const last = first + shown - 1;
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground">
    <span className="tabular-nums">Showing {first}–{last} of {total}</span>
    <div className="flex items-center gap-3"><span className="tabular-nums">Page {page} of {Math.max(1, pageCount)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button></div></div>
  </div>;
}
