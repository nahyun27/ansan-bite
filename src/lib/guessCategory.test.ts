import { describe, expect, it } from 'vitest';
import { guessCategory } from './guessCategory';

describe('guessCategory', () => {
  it.each([
    ['중앙해장', '한식', '해장국'],
    ['든든 순대국 본점', '한식', '순대국밥'],
    ['상록 감자탕', '한식', '감자탕'],
    ['마라공방', '중식', '마라탕'],
    ['라멘 이치', '일식', '라멘'],
    ['후문 돈가스', '일식', '돈까스'],
    ['쌀국수 하노이', '아시안', '쌀국수'],
    ['정문 김밥천국', '분식', '김밥'],
    ['동네 파스타', '양식', '파스타'],
    ['치킨앤맥주', '기타', '치킨'],
    ['본죽', '한식', '죽'],
    ['스타벅스 안산중앙역점 카페', '카페·디저트', '커피'],
  ])('%s → %s / %s', (name, category, menu) => {
    expect(guessCategory(name)).toEqual({ category, menu });
  });

  it('모르는 이름은 null', () => {
    expect(guessCategory('죽전 미가')).toBeNull(); // 한 글자 키워드는 끝에 올 때만
    expect(guessCategory('어나더레벨')).toBeNull();
    expect(guessCategory('')).toBeNull();
  });

  it('이름에 없으면 공유 텍스트에서도 찾음', () => {
    expect(guessCategory('어나더레벨', '[네이버 지도] 어나더레벨 · 이탈리아음식 파스타')).toEqual({ category: '양식', menu: '파스타' });
  });
});
