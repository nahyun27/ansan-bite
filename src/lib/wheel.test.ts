import { describe, expect, it } from 'vitest';
import { indexAtTop, targetRotation } from './wheel';

describe('wheel', () => {
  it.each([
    [0, 0, 3], [0, 2, 3], [123, 1, 4], [1800, 5, 6], [37, 0, 2],
  ])('current %d → index %d / %d 칸이 맨 위에 멈춤', (current, index, count) => {
    for (const offset of [-0.5, 0, 0.5]) {
      const r = targetRotation(current, index, count, 5, offset);
      expect(r).toBeGreaterThanOrEqual(current + 5 * 360);
      expect(indexAtTop(r, count)).toBe(index);
    }
  });
});
