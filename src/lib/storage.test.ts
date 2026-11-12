import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { createInitialData } from '../data/defaults';
import { backfillAutoTags, migrateCategories, migrateMenus, migrateRatings, removeLegacyExamples } from './storage';

describe('storage', () => {
  it('처음 시작하면 식당 없이 기본 지역만', () => {
    const d = createInitialData();
    expect(d.restaurants).toEqual([]);
    expect(d.areas).toContain('학교 근처');
  });

  it('예전 예시 식당과 그 기록만 지우고 직접 등록한 식당은 유지', () => {
    const base = { area: '학교 근처', category: '한식', menus: [] as string[] };
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

describe('migrateCategories', () => {
  it("'카페·디저트' → 이름으로 카페/빵집/디저트", () => {
    const base = { area: 'a', menus: [], goodFor: [], tags: [] };
    const d = migrateCategories({
      version: 1, areas: ['a'], visits: [],
      restaurants: [
        { ...base, id: '1', name: '오월 베이커리', category: '카페·디저트' },
        { ...base, id: '2', name: '어나더', category: '카페·디저트' },
        { ...base, id: '3', name: '국밥', category: '한식' },
      ],
    });
    expect(d.restaurants.map((r) => r.category)).toEqual(['빵집', '카페', '한식']);
  });
});

describe('migrateMenus', () => {
  it('예전 menu 문자열 → menus 목록', () => {
    const old = { version: 1, areas: ['a'], visits: [], restaurants: [
      { id: '1', name: 'x', area: 'a', category: '한식', menu: '국밥', goodFor: [], tags: [] },
      { id: '2', name: 'y', area: 'a', category: '한식', menu: '', goodFor: [], tags: [] },
    ] } as unknown as AppData;
    expect(migrateMenus(old).restaurants.map((r) => r.menus)).toEqual([['국밥'], []]);
    expect(migrateMenus(old).restaurants[0]).not.toHaveProperty('menu');
  });
});

describe('backfillAutoTags', () => {
  it('분류에 맞는 자동 태그: 밥집은 느낌·술집, 빵집은 디저트용', () => {
    const base = { area: 'a', goodFor: [], tags: [] as string[] };
    const d = backfillAutoTags({ version: 1, areas: ['a'], visits: [], restaurants: [
      { ...base, id: '1', name: '마라공방', category: '중식', menus: ['마라탕'] },
      { ...base, id: '2', name: '오월 베이커리', category: '빵집', menus: ['소금빵'] },
      { ...base, id: '3', name: '정문 포차', category: '기타', menus: [] },
      { ...base, id: '4', name: '샐러드', category: '양식', menus: [], tags: ['연구실 점심용', '가볍게'] },
    ] });
    expect(d.restaurants.map((r) => r.tags)).toEqual([['자극적'], ['디저트용'], ['술집'], ['연구실 점심용', '가볍게']]);
    expect(backfillAutoTags(d)).toBe(d); // 한 번만
  });
});

describe('migrateRatings', () => {
  it('3단계 평가 → 별점, 식당 별점은 가장 최근 평가', () => {
    const old = { version: 1, areas: ['a'], restaurants: [
      { id: 'r', name: 'x', area: 'a', category: '한식', menus: [], goodFor: [], tags: [] },
    ], visits: [
      { id: '1', restaurantId: 'r', date: '2026-10-01', rating: 'nope' },
      { id: '2', restaurantId: 'r', date: '2026-11-01', rating: 'again' },
    ] } as unknown as AppData;
    const d = migrateRatings(old);
    expect(d.visits.map((v) => v.stars)).toEqual([1, 5]);
    expect(d.visits[0]).not.toHaveProperty('rating');
    expect(d.restaurants[0].stars).toBe(5);
  });
});
