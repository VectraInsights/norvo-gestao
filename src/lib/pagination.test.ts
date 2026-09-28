import { describe, expect, it } from "vitest";
import {
  getPageCount,
  getPageRange,
  hasNextPage,
  hasPreviousPage,
  normalizePageSize,
} from "./pagination";

describe("paginação", () => {
  it("calcula intervalos baseados em zero para o Supabase", () => {
    expect(getPageRange(2, 50)).toEqual({ from: 50, to: 99, page: 2, pageSize: 50 });
  });

  it("limita tamanhos inválidos ao intervalo seguro", () => {
    expect(normalizePageSize(0)).toBe(1);
    expect(normalizePageSize(9999)).toBe(500);
    expect(normalizePageSize(Number.NaN)).toBe(50);
  });

  it("calcula navegação sem páginas negativas", () => {
    expect(getPageCount(101, 50)).toBe(3);
    expect(hasNextPage(2, 101, 50)).toBe(true);
    expect(hasPreviousPage(1)).toBe(false);
  });
});
