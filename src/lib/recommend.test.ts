import { describe, expect, it } from 'vitest';
import type { AppData, Restaurant, Visit } from '../types';
import { filterCandidates, recommend, type Conditions } from './recommend';
import { currentRating, formatPrice } from './utils';

const r = (id: string, over: Partial<Restaurant> = {}): Restaurant => ({
  id, name: id, area: '학교 근처', category: '한식', menus: [], price: 9000,
  goodFor: ['혼밥', '친구랑'], tags: [], ...over,
});
const data = (restaurants: Restaurant[], visits: Visit[] = []): AppData => ({
  version: 1, areas: ['학교 근처', '중앙역'], restaurants, visits,
});
const cond: Conditions = { kind: '밥', area: '학교 근처', companion: '혼밥', priceLevel: '싼 곳', tags: [] };
const TODAY = '2026-11-12';
const noJitter = { today: TODAY, jitter: {} };

describe('filterCandidates', () => {
  it('지역·예산·동행·nope 평가로 걸러낸다', () => {
    const d = data(
      [
        r('ok'),
        r('other-area', { area: '중앙역' }),
        r('expensive', { price: 15000 }),
        r('no-solo', { goodFor: ['데이트'] }),
        r('nope'),
      ],
      [{ id: 'v1', restaurantId: 'nope', date: '2026-10-01', rating: 'nope' }],
    );
    expect(filterCandidates(d, cond).map((x) => x.id)).toEqual(['ok']);
    expect(filterCandidates(d, { ...cond, priceLevel: null }).map((x) => x.id)).toEqual(['ok', 'expensive']);
  });

  it('밥/카페 구분', () => {
    const d = data([r('rice'), r('cafe', { category: '카페' }), r('bread', { category: '빵집' })]);
    expect(filterCandidates(d, cond).map((x) => x.id)).toEqual(['rice']);
    expect(filterCandidates(d, { ...cond, kind: '카페' }).map((x) => x.id)).toEqual(['cafe', 'bread']);
  });

  it('가격대: 직접 고른 값이 가격보다 우선', () => {
    const d = data([r('date', { price: undefined, priceLevel: '비싼 곳' }), r('cheap', { price: 7000 }), r('mid', { price: 15000 })]);
    expect(filterCandidates(d, { ...cond, priceLevel: '비싼 곳' }).map((x) => x.id)).toEqual(['date']);
    expect(filterCandidates(d, { ...cond, priceLevel: '보통' }).map((x) => x.id)).toEqual(['mid']);
  });

  it('가격을 모르는 곳은 가격대로 걸러내지 않는다', () => {
    const d = data([r('unknown', { price: undefined })]);
    expect(filterCandidates(d, cond).map((x) => x.id)).toEqual(['unknown']);
  });
});

describe('currentRating', () => {
  it('평가가 있는 가장 최근 방문에서 계산한다', () => {
    const visits: Visit[] = [
      { id: '1', restaurantId: 'a', date: '2026-10-01', rating: 'nope' },
      { id: '2', restaurantId: 'a', date: '2026-11-01', rating: 'again' },
      { id: '3', restaurantId: 'a', date: '2026-11-10' }, // 아직 평가 안 함
    ];
    expect(currentRating('a', visits)).toBe('again');
  });
});

describe('recommend', () => {
  it('최대 3곳, 점수 높은 순', () => {
    const d = data([r('a'), r('b'), r('c'), r('d')]);
    expect(recommend(d, cond, noJitter)).toHaveLength(3);
  });

  it('최근에 먹은 곳은 뒤로 밀린다', () => {
    const d = data([r('recent', { category: '분식' }), r('fresh', { category: '분식' })], [
      { id: 'v', restaurantId: 'recent', date: '2026-11-11' },
    ]);
    expect(recommend(d, cond, noJitter)[0].restaurant.id).toBe('fresh');
  });

  it('또 갈래 평가 + 오래 안 간 곳이 위로 온다', () => {
    const d = data([r('loved', { category: '일식' }), r('unknown')], [
      { id: 'v', restaurantId: 'loved', date: '2026-10-01', rating: 'again' },
    ]);
    const res = recommend(d, cond, noJitter);
    expect(res[0].restaurant.id).toBe('loved');
    expect(res[0].reasons[0]).toBe('또 가고 싶다고 했던 곳이에요.');
  });

  it('최근 2번 먹은 음식 종류는 감점', () => {
    const d = data([r('x', { category: '중식' }), r('y', { category: '일식' }), r('z', { category: '중식' })], [
      { id: 'v', restaurantId: 'z', date: '2026-10-01' },
    ]);
    // x는 아직 안 가봤지만 최근 먹은 중식이라 감점 → y가 1위
    expect(recommend(d, cond, noJitter)[0].restaurant.id).toBe('y');
  });

  it('고른 태그가 붙은 곳만 추천', () => {
    const d = data([r('a'), r('b', { tags: ['가볍게'] }), r('c', { tags: ['자극적'] })]);
    const res = recommend(d, { ...cond, tags: ['가볍게'] }, noJitter);
    expect(res.map((x) => x.restaurant.id)).toEqual(['b']);
    expect(res[0].reasons[0]).toContain('가볍게');
  });

  it('exclude에 있는 곳은 빠진다', () => {
    const d = data([r('a'), r('b')]);
    expect(recommend(d, cond, { ...noJitter, exclude: new Set(['a']) }).map((x) => x.restaurant.id)).toEqual(['b']);
  });

  it('같은 jitter면 결과가 같다 (화면 재렌더링에도 안 바뀜)', () => {
    const d = data([r('a'), r('b'), r('c'), r('d'), r('e')]);
    const jitter = { a: 1, b: 9, c: 3, d: 7, e: 5 };
    const one = recommend(d, cond, { today: TODAY, jitter });
    const two = recommend(d, cond, { today: TODAY, jitter });
    expect(one.map((x) => x.restaurant.id)).toEqual(['b', 'd', 'e']);
    expect(two.map((x) => x.restaurant.id)).toEqual(one.map((x) => x.restaurant.id));
  });
});

describe('formatPrice', () => {
  it('천/만 단위로 표시한다', () => {
    expect(formatPrice(6500)).toBe('약 7천 원');
    expect(formatPrice(9000)).toBe('약 9천 원');
    expect(formatPrice(9500)).toBe('약 1만 원');
    expect(formatPrice(10500)).toBe('약 1.1만 원');
    expect(formatPrice(15000)).toBe('약 1.5만 원');
    expect(formatPrice(20000)).toBe('약 2만 원');
    expect(formatPrice(undefined)).toBe('가격 미입력');
  });
});
