import type { LatencyStats } from "./types.js";

export function calculateLatencyStats(values: number[]): LatencyStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = Math.round((sum / sorted.length) * 100) / 100;

  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? sorted[mid]
      : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;

  const p95Index = Math.min(
    Math.floor(sorted.length * 0.95),
    sorted.length - 1
  );
  const p95 = sorted[p95Index];

  const variance =
    sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    sorted.length;
  const stdDev = Math.round(Math.sqrt(variance) * 100) / 100;

  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    mean,
    median,
    p95: Math.round(p95 * 100) / 100,
    stdDev,
  };
}

/**
 * Standard heuristic token counter for technical HTML/Markdown content.
 * 1 token ~= 3.6 chars for English/code/HTML.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.6);
}
