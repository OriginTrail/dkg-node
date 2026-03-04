import type { DocumentConversionOptions } from "./types";

export interface NormalizedPageRange {
  startPage: number;
  endPage: number;
  hasPageFilter: boolean;
}

function toSafePageNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.trunc(value);
}

/**
 * Normalize optional 1-indexed page range options to inclusive bounds.
 * Bounds are clamped to [1, totalPages] and preserve start <= end.
 */
export function normalizePageRange(
  totalPages: number,
  options?: Pick<DocumentConversionOptions, "pageStart" | "pageEnd">,
): NormalizedPageRange {
  const normalizedTotalPages =
    Number.isFinite(totalPages) && totalPages > 0 ? Math.trunc(totalPages) : 0;
  const hasPageFilter = options?.pageStart != null || options?.pageEnd != null;

  // Providers can occasionally produce empty-page responses; keep bounds valid.
  if (normalizedTotalPages === 0) {
    return {
      startPage: 1,
      endPage: 0,
      hasPageFilter,
    };
  }

  const requestedStart = toSafePageNumber(options?.pageStart, 1);
  const requestedEnd = toSafePageNumber(options?.pageEnd, normalizedTotalPages);

  const startPage = Math.min(normalizedTotalPages, Math.max(1, requestedStart));
  const endPage = Math.min(
    normalizedTotalPages,
    Math.max(startPage, requestedEnd),
  );

  return {
    startPage,
    endPage,
    hasPageFilter,
  };
}
