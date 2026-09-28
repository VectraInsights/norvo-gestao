export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export function normalizePageSize(value: number | undefined, fallback = DEFAULT_PAGE_SIZE) {
  const size = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
}

export function getPageRange(page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const safePage = Math.max(1, Math.trunc(page || 1));
  const safeSize = normalizePageSize(pageSize);
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1, page: safePage, pageSize: safeSize };
}

export function getPageCount(total: number, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / normalizePageSize(pageSize)));
}

export function hasNextPage(page: number, total: number, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.trunc(page || 1)) < getPageCount(total, pageSize);
}

export function hasPreviousPage(page: number) {
  return Math.max(1, Math.trunc(page || 1)) > 1;
}
