import { describe, expect, it } from 'vitest';
import { isExact, pickKakaoPlace, queriesFor, trimToDong, trimToNumber, trimToStreet } from './geocode';

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

const kp = (name: string, road: string, id = name) => ({ id, place_name: name, category_name: '', phone: '', address_name: '', road_address_name: road, x: '126.8', y: '37.3', place_url: '' });
describe('pickKakaoPlace', () => {
  it('안산 밖 결과는 무시, 주소가 같은 곳 우선', () => {
    const places = [kp('밀숲 강남점', '서울 강남구 테헤란로 1'), kp('밀숲 안산한양대점', '경기 안산시 상록구 한양대학로 55', 'ok'), kp('밀숲 고잔점', '경기 안산시 단원구 고잔로 1')];
    expect(pickKakaoPlace(places, { name: '밀숲', address: '경기 안산시 상록구 한양대학로 55 1층' })?.id).toBe('ok');
  });
  it('주소가 없으면 이름이 같은 곳 → 포함하는 곳', () => {
    expect(pickKakaoPlace([kp('국밥집 본점', '경기 안산시 a'), kp('국밥집', '경기 안산시 b', 'same')], { name: '국밥집' })?.id).toBe('same');
    expect(pickKakaoPlace([kp('다른가게', '경기 안산시 a'), kp('마라공방 한대점', '경기 안산시 b', 'inc')], { name: '마라공방' })?.id).toBe('inc');
  });
  it('애매하면 고르지 않음', () => {
    expect(pickKakaoPlace([kp('다른가게1', '경기 안산시 a'), kp('다른가게2', '경기 안산시 b')], { name: '없는집' })).toBeNull();
    expect(pickKakaoPlace([kp('서울집', '서울 어딘가')], { name: '서울집' })).toBeNull();
  });
});
