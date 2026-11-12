import type { AppData } from '../types';

export const DEFAULT_AREAS = ['학교 근처', '중앙역', '고잔동', '상록수'];
export const DEFAULT_AREA = '학교 근처';

/** 처음 시작할 때: 지역만 있고 식당은 직접 등록 */
export function createInitialData(): AppData {
  return { version: 1, areas: [...DEFAULT_AREAS], restaurants: [], visits: [] };
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

export const SUGGESTED_TAGS = ['도보 5분', '도보 10분', '연구실 점심용', '비 오는 날', '늦게 먹을 때', '빨리 먹을 때'];
export const CATEGORIES = ['한식', '분식', '중식', '일식', '양식', '아시안', '카페·디저트', '기타'];
