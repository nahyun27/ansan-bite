import type { AppData } from '../types';

export const DEFAULT_AREAS = ['학교 근처', '중앙역', '고잔동', '상록수'];
export const DEFAULT_AREA = '학교 근처';

/** 처음 시작할 때: 지역만 있고 식당은 직접 등록 */
export function createInitialData(): AppData {
  // autoTagsVersion: 새로 시작하면 채울 기존 식당이 없음
  return { version: 1, areas: [...DEFAULT_AREAS], restaurants: [], visits: [], autoTagsVersion: 2 };
}

/** 예전 버전에 들어 있던 예시 식당 id 접두사 (불러올 때 자동 정리용) */
export const isLegacyExample = (id: string) => id.startsWith('seed-');

/** 지역별 기준 위치를 처음 찾을 때 쓰는 검색어 (없으면 '안산 {지역}') */
export const DEFAULT_CENTER_QUERY: Record<string, string> = {
  '학교 근처': '한양대학교 ERICA캠퍼스',
  중앙역: '중앙역 4호선',
  고잔동: '고잔역',
  상록수: '상록수역',
};

/** 느낌 태그: 둘 중 하나만 고를 수 있음 */
export const MOOD_TAGS = ['가볍게', '자극적'] as const;
export const DRINK_TAG = '술집';
export const HEALTHY_TAG = '건강식';
export const VIBE_TAG = '분위기 좋음';
/** 밥: 오늘 화면에 항상 맨 앞에 나오는 태그 */
export const QUICK_TAGS = [...MOOD_TAGS, DRINK_TAG, HEALTHY_TAG, VIBE_TAG];
/** 카페·빵집: 용도 태그 (여러 개 가능) */
export const CAFE_USE_TAGS = ['공부용', '수다용', '디저트용'];
export const CAFE_QUICK_TAGS = [...CAFE_USE_TAGS, VIBE_TAG];
/** 오늘 화면 빠른 태그 전체 (다른 태그 목록에서 중복으로 안 보이게) */
export const ALL_QUICK_TAGS = [...new Set([...QUICK_TAGS, ...CAFE_QUICK_TAGS])];
/** 이름·분류로 자동으로 붙였다 뗐다 하는 태그 (직접 고른 '분위기 좋음' 등은 건드리지 않음) */
export const AUTO_TAGS: string[] = [...MOOD_TAGS, DRINK_TAG, HEALTHY_TAG, ...CAFE_USE_TAGS];
export const SUGGESTED_TAGS = [...QUICK_TAGS, '포장', '배달', '비 오는 날', '늦게 먹을 때', '빨리 먹을 때'];
export const CAFE_SUGGESTED_TAGS = [...CAFE_QUICK_TAGS, '콘센트 많음', '조용함', '테라스', '늦게까지'];
export const MEAL_CATEGORIES = ['한식', '분식', '중식', '일식', '양식', '아시안', '기타'];
/** 오늘 화면에서 '카페·빵집'을 골랐을 때만 추천되는 분류 */
export const CAFE_CATEGORIES = ['카페', '빵집', '디저트'];
export const CATEGORIES = [...MEAL_CATEGORIES, ...CAFE_CATEGORIES];
export const isCafeCategory = (c: string) => CAFE_CATEGORIES.includes(c);
