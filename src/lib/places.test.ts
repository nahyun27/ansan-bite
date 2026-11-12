import { describe, expect, it } from 'vitest';
import { isAlreadySaved, parseCategory, placeToRestaurant, walkTag, type PlaceResult } from './places';

const place: PlaceResult = {
  id: '123', name: '든든국밥', categoryName: '음식점 > 한식 > 해장국', phone: '', address: '지번 주소',
  roadAddress: '도로명 주소', x: 126.8352, y: 37.2995, url: 'http://place.map.kakao.com/123', distance: null,
};
const center = { label: '학교', x: 126.8352, y: 37.2966 }; // 약 320m 남쪽

describe('places', () => {
  it('카테고리 파싱', () => {
    expect(parseCategory('음식점 > 한식 > 해장국')).toEqual({ category: '한식', detail: '해장국' });
    expect(parseCategory('음식점 > 아시아음식 > 베트남음식')).toEqual({ category: '아시안', detail: '베트남음식' });
    expect(parseCategory('음식점 > 술집')).toEqual({ category: '기타', detail: '' });
  });

  it('도보 태그', () => {
    expect(walkTag(300)).toBe('도보 5분');
    expect(walkTag(700)).toBe('도보 10분');
    expect(walkTag(1200)).toBeNull();
  });

  it('식당으로 변환: 가격은 비우고 거리 태그·지도 링크를 채움', () => {
    const r = placeToRestaurant(place, '학교 근처', center, 'id1');
    expect(r).toMatchObject({
      name: '든든국밥', area: '학교 근처', category: '한식', menus: ['해장국'], tags: ['도보 5분'],
      mapUrl: place.url, kakaoId: '123', address: '도로명 주소', phone: undefined,
    });
    expect(r.price).toBeUndefined();
  });

  it('이미 저장된 곳 판별 (카카오 id 또는 이름)', () => {
    const saved = placeToRestaurant(place, '학교 근처', center, 'id1');
    expect(isAlreadySaved(place, [saved])).toBe(true);
    expect(isAlreadySaved(place, [{ ...saved, kakaoId: undefined }])).toBe(true);
    expect(isAlreadySaved(place, [{ ...saved, kakaoId: undefined, name: '다른 집' }])).toBe(false);
  });
});
