import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { createInitialData } from '../data/defaults';
import { removeLegacyExamples } from './storage';

describe('storage', () => {
  it('처음 시작하면 식당 없이 기본 지역만', () => {
    const d = createInitialData();
    expect(d.restaurants).toEqual([]);
    expect(d.areas).toContain('학교 근처');
  });

  it('예전 예시 식당과 그 기록만 지우고 직접 등록한 식당은 유지', () => {
    const base = { area: '학교 근처', category: '한식', menu: '', goodFor: [], tags: [] } as const;
    const d: AppData = {
      version: 1,
      areas: ['학교 근처'],
      restaurants: [
        { ...base, id: 'seed-1', name: '가짜', goodFor: ['혼밥'], tags: [] },
        { ...base, id: 'abc', name: '진짜', goodFor: ['혼밥'], tags: [] },
      ],
      visits: [
        { id: 'v1', restaurantId: 'seed-1', date: '2026-11-01' },
        { id: 'v2', restaurantId: 'abc', date: '2026-11-02' },
      ],
    };
    const cleaned = removeLegacyExamples(d);
    expect(cleaned.restaurants.map((r) => r.name)).toEqual(['진짜']);
    expect(cleaned.visits.map((v) => v.id)).toEqual(['v2']);
    const clean = createInitialData();
    expect(removeLegacyExamples(clean)).toBe(clean); // 정리할 게 없으면 그대로
  });
});
