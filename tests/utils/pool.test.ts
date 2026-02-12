import { describe, it, expect } from "vitest";
import { poolMap } from "../../src/utils/pool.js";

describe("poolMap", () => {
  it("processes all items and preserves result order", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await poolMap(items, async (n) => n * 2, 3);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("respects concurrency limit", async () => {
    let running = 0;
    let maxRunning = 0;

    const items = [1, 2, 3, 4, 5, 6];
    await poolMap(items, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
    }, 2);

    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it("handles empty input array", async () => {
    const results = await poolMap([], async (n: number) => n, 3);
    expect(results).toEqual([]);
  });

  it("handles concurrency greater than items length", async () => {
    const items = [1, 2];
    const results = await poolMap(items, async (n) => n + 1, 100);
    expect(results).toEqual([2, 3]);
  });

  it("concurrency of 1 processes sequentially", async () => {
    const order: number[] = [];
    const items = [1, 2, 3];
    await poolMap(items, async (n) => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 5));
    }, 1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("propagates errors from worker functions", async () => {
    const items = [1, 2, 3];
    await expect(
      poolMap(items, async (n) => {
        if (n === 2) throw new Error("fail on 2");
        return n;
      }, 2),
    ).rejects.toThrow("fail on 2");
  });
});
