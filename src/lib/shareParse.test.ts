import { describe, expect, it } from 'vitest';
import { guessArea, parseShare } from './shareParse';

describe('parseShare', () => {
  it('네이버지도 공유 (여러 줄)', () => {
    const r = parseShare('[네이버 지도]\n든든국밥 본점\n경기 안산시 상록구 한양대학로 55\nhttps://naver.me/5aBcDeFg');
    expect(r).toEqual({
      name: '든든국밥 본점', url: 'https://naver.me/5aBcDeFg', address: '경기 안산시 상록구 한양대학로 55',
      phone: undefined, source: '네이버지도', kakaoId: undefined,
    });
  });

  it('카카오맵 공유 (태그와 이름이 같은 줄)', () => {
    const r = parseShare('[카카오맵] 라멘 이치\n경기 안산시 단원구 고잔동 123-4\nhttps://kko.to/AbC123xyz');
    expect(r).toMatchObject({ name: '라멘 이치', url: 'https://kko.to/AbC123xyz', address: '경기 안산시 단원구 고잔동 123-4', source: '카카오맵' });
  });

  it('카카오 place 링크에서 id 추출 + 라벨 형식 + 전화번호', () => {
    const r = parseShare('장소명: 상록 감자탕\n주소: 경기 안산시 상록구 상록수로 10\n031-123-4567\nhttps://place.map.kakao.com/12345678');
    expect(r).toMatchObject({ name: '상록 감자탕', address: '경기 안산시 상록구 상록수로 10', phone: '031-123-4567', kakaoId: '12345678', source: '카카오맵' });
  });

  it('이름과 링크가 한 줄에', () => {
    expect(parseShare('든든국밥 https://naver.me/xyz')).toMatchObject({ name: '든든국밥', url: 'https://naver.me/xyz' });
  });

  it('링크만 있으면 이름은 비움', () => {
    expect(parseShare('https://naver.me/xyz')).toMatchObject({ name: '', url: 'https://naver.me/xyz', source: '네이버지도' });
  });

  it('이름만 있어도 받음, 빈 문자열은 null', () => {
    expect(parseShare('  중앙 떡볶이 ')).toMatchObject({ name: '중앙 떡볶이', url: undefined, source: '링크' });
    expect(parseShare('   ')).toBeNull();
  });
});

describe('guessArea', () => {
  it('주소에 지역 이름이 있으면 추측', () => {
    const areas = ['학교 근처', '중앙역', '고잔동', '상록수'];
    expect(guessArea('경기 안산시 단원구 고잔동 123-4', areas)).toBe('고잔동');
    expect(guessArea('경기 안산시 상록구 상록수로 10', areas)).toBe('상록수');
    expect(guessArea('경기 안산시 상록구 한양대학로 55', areas)).toBeUndefined();
  });
});
