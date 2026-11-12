import { describe, expect, it } from 'vitest';
import type { AppData, Restaurant } from '../types';
import { averageStars, initialUploadOps, mergeSnapshot, mergeVisits, type Snapshot } from './remote';

const r = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  id, name: id, area: '학교 근처', category: '한식', menus: [], goodFor: ['혼밥'], tags: [], ...over,
});
const local = (over: Partial<AppData> = {}): AppData => ({ version: 1, areas: ['학교 근처'], restaurants: [], visits: [], ...over });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ restaurants: [], areas: [], stars: {}, personal: null, personalVersion: 0, ...over });

describe('mergeSnapshot', () => {
  it('서버 목록으로 바꾸고 내 별점을 채움', () => {
    const d = mergeSnapshot(local({ restaurants: [r('old')] }), snap({
      restaurants: [r('a') as unknown as Record<string, unknown>], areas: ['학교 근처', '중앙역'], stars: { a: { 나현: 4, 친구: 2 } },
    }), '나현', []);
    expect(d.restaurants.map((x) => [x.id, x.stars])).toEqual([['a', 4]]);
    expect(d.areas).toEqual(['학교 근처', '중앙역']);
    expect(d.allStars).toEqual({ a: { 나현: 4, 친구: 2 } });
  });

  it('아직 못 보낸 변경은 사라지지 않음 (오프라인에서 추가·삭제·별점)', () => {
    const d = mergeSnapshot(local(), snap({ restaurants: [r('a'), r('b')] as unknown as Record<string, unknown>[] }), '나현', [
      { op: 'upsertRestaurant', restaurant: r('new') },
      { op: 'deleteRestaurant', id: 'b' },
      { op: 'setStars', restaurantId: 'a', stars: 5 },
      { op: 'addArea', area: '한대앞역' },
    ]);
    expect(d.restaurants.map((x) => [x.id, x.stars])).toEqual([['a', 5], ['new', undefined]]);
    expect(d.areas).toContain('한대앞역');
    expect(d.allStars?.a).toEqual({ 나현: 5 });
  });

  it('예전 형식(menu 문자열)으로 올라간 식당도 고쳐서 받음', () => {
    const d = mergeSnapshot(local(), snap({ restaurants: [{ ...r('a'), menus: undefined, menu: '국밥' } as unknown as Record<string, unknown>] }), '나현', []);
    expect(d.restaurants[0].menus).toEqual(['국밥']);
  });
});

describe('initialUploadOps', () => {
  it('처음 로그인: 서버에 없는 식당·지역·내 별점을 올림 (별점은 식당과 따로)', () => {
    const ops = initialUploadOps(
      local({ areas: ['학교 근처', '고잔동'], restaurants: [r('mine', { stars: 5 }), r('both', { stars: 3 })] }),
      snap({ areas: ['학교 근처'], restaurants: [r('both') as unknown as Record<string, unknown>], stars: { both: { 나현: 4 } } }),
      '나현',
    );
    expect(ops).toEqual([
      { op: 'addArea', area: '고잔동' },
      { op: 'upsertRestaurant', restaurant: { ...r('mine'), addedBy: '나현' } },
      { op: 'setStars', restaurantId: 'mine', stars: 5 },
      // both: 서버에 이미 있고 내 별점도 있어서 안 올림
    ]);
    expect(ops[1]).not.toHaveProperty('restaurant.stars');
  });
});

it('mergeVisits: 합집합, 같은 id는 이 기기 것', () => {
  expect(mergeVisits(
    [{ id: '1', restaurantId: 'a', date: '2026-11-12', stars: 5 }],
    [{ id: '1', restaurantId: 'a', date: '2026-11-12' }, { id: '2', restaurantId: 'b', date: '2026-11-10' }],
  ).map((v) => [v.id, v.stars])).toEqual([['1', 5], ['2', undefined]]);
});

it('averageStars', () => {
  expect(averageStars({ a: { x: 5, y: 4 } }, 'a')).toEqual({ avg: 4.5, count: 2 });
  expect(averageStars({}, 'a')).toBeUndefined();
});
