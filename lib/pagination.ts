export const PAGE_SIZE = 10;
export function pageWindow(total: number, requested: number) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.max(1, Math.min(pages, Math.floor(requested) || 1));
  return {
    page,
    pages,
    start: (page - 1) * PAGE_SIZE,
    end: Math.min(page * PAGE_SIZE, total),
  };
}
