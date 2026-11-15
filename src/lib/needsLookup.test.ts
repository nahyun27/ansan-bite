import { describe, expect, it } from 'vitest';
import type { Restaurant } from '../types';
import { needsLookup } from './geocode';

const r = (over: Partial<Restaurant>): Restaurant => ({ id: 'x', name: 'x', area: 'a', category: '한식', menus: [], goodFor: [], tags: [], ...over });
const c = { x: 126.8, y: 37.3 };

describe('needsLookup', () => {
  it('무료 지도: 위치 없고 안 찾아본 곳만', () => {
    expect(needsLookup(r({}), false)).toBe(true);
    expect(needsLookup(r({ coordsSource: 'none' }), false)).toBe(false);
    expect(needsLookup(r({ coords: c, coordsSource: 'approx' }), false)).toBe(false);
  });
  it('카카오: 없음·대략·못 찾음을 한 번씩 다시, 정확·직접·카카오는 그대로', () => {
    expect(needsLookup(r({}), true)).toBe(true);
    expect(needsLookup(r({ coords: c, coordsSource: 'approx' }), true)).toBe(true);
    expect(needsLookup(r({ coordsSource: 'none' }), true)).toBe(true);
    expect(needsLookup(r({ coords: c, coordsSource: 'approx', kakaoTried: true }), true)).toBe(false);
    expect(needsLookup(r({ coords: c, coordsSource: 'exact' }), true)).toBe(false);
    expect(needsLookup(r({ coords: c, coordsSource: 'manual' }), true)).toBe(false);
    expect(needsLookup(r({ coords: c, coordsSource: 'kakao' }), true)).toBe(false);
    expect(needsLookup(r({ coordsSource: 'notfound' }), true)).toBe(false);
  });
});
