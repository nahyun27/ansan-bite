import { describe, expect, it } from 'vitest';
import { isExact, queriesFor, trimToDong, trimToNumber, trimToStreet } from './geocode';

describe('주소 다듬기', () => {
  it('번지까지만', () => {
    expect(trimToNumber('경기 안산시 상록구 한양대학로 55 2층 201호')).toBe('경기 안산시 상록구 한양대학로 55');
    expect(trimToNumber('경기 안산시 상록구 사동 1271-3 1층')).toBe('경기 안산시 상록구 사동 1271-3');
    expect(trimToNumber('경기 안산시 단원구 고잔2길 9')).toBe('경기 안산시 단원구 고잔2길 9');
  });
  it('길 / 동까지', () => {
    expect(trimToStreet('경기 안산시 단원구 고잔로 54')).toBe('경기 안산시 단원구 고잔로');
    expect(trimToStreet('경기 안산시 상록구 사동 1271')).toBe('경기 안산시 상록구 사동');
    expect(trimToDong('경기 안산시 상록구 사동 1271')).toBe('경기 안산시 상록구 사동');
    expect(trimToDong('경기 안산시 상록구 한양대학로 55')).toBeNull();
  });
  it('검색 순서: 번지 → 이름 → 길 → 동, 중복 없음', () => {
    expect(queriesFor({ name: '밀숲', address: '경기 안산시 상록구 사동 1271 1층' }).map((x) => x.q)).toEqual([
      '경기 안산시 상록구 사동 1271', '밀숲', '경기 안산시 상록구 사동',
    ]);
    expect(queriesFor({ name: '밀숲' })).toEqual([{ q: '밀숲', poi: true }]);
  });
});

it('정확/대략 판단', () => {
  expect(isExact({ lat: '0', lon: '0', address: { house_number: '55' } }, false)).toBe(true);
  expect(isExact({ lat: '0', lon: '0', category: 'amenity' }, true)).toBe(true);
  expect(isExact({ lat: '0', lon: '0', addresstype: 'quarter' }, false)).toBe(false);
  expect(isExact({ lat: '0', lon: '0', addresstype: 'road' }, false)).toBe(false);
});
