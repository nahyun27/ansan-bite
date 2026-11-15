import { describe, expect, it } from 'vitest';
import { isAlreadySaved, parseCategory, placeToRestaurant, type PlaceResult } from './places';

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
    expect(parseCategory('음식점 > 한식 > 국밥 > 신의주찹쌀순대')).toEqual({ category: '한식', detail: '국밥' });
    expect(parseCategory('음식점 > 카페 > 커피전문점 > 스타벅스')).toEqual({ category: '카페', detail: '커피전문점' });
    expect(parseCategory('음식점 > 간식 > 제과,베이커리')).toEqual({ category: '빵집', detail: '빵' });
    expect(parseCategory('음식점 > 간식 > 아이스크림')).toEqual({ category: '디저트', detail: '아이스크림' });
  });


  it('식당으로 변환: 가격은 비우고 지도 링크·카카오 좌표를 채움', () => {
    const r = placeToRestaurant(place, '학교 근처', center, 'id1');
    expect(r).toMatchObject({
      name: '든든국밥', area: '학교 근처', category: '한식', menus: ['해장국'], tags: [], coordsSource: 'kakao',
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
