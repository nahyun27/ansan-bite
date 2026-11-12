export type Rating = 'again' | 'okay' | 'nope';
export type Companion = '혼밥' | '친구랑' | '데이트';

export const COMPANIONS: Companion[] = ['혼밥', '친구랑', '데이트'];
export const RATING_LABEL: Record<Rating, string> = {
  again: '또 갈래',
  okay: '무난해',
  nope: '내 취향 아님',
};
export const RATING_EMOJI: Record<Rating, string> = { again: '😍', okay: '🙂', nope: '🙅' };

export interface Restaurant {
  id: string;
  name: string;
  /** 자유 문자열 — 사용자가 새 지역을 추가할 수 있음 */
  area: string;
  category: string;
  menu: string;
  /** 1인 대략 가격(원). 모르면 비워둠 → 예산 조건에 걸러지지 않고 '보충 필요'로 표시 */
  price?: number;
  goodFor: Companion[];
  tags: string[];
  mapUrl?: string;
  memo?: string;
  /** 카카오맵에서 가져온 경우 */
  kakaoId?: string;
  address?: string;
  phone?: string;
  /** 경도/위도 */
  coords?: { x: number; y: number };
}

/** 평가는 Visit에만 저장. 식당의 현재 평가는 방문 기록에서 계산한다. */
export interface Visit {
  id: string;
  restaurantId: string;
  /** YYYY-MM-DD (로컬 날짜) */
  date: string;
  rating?: Rating;
  /** 평가 요청을 건너뛴 경우 다시 묻지 않음 */
  ratingSkipped?: boolean;
}

/** 지역의 기준 위치 (카카오 검색 반경의 중심) */
export interface AreaCenter {
  label: string;
  x: number;
  y: number;
}

export interface AppData {
  version: 1;
  areas: string[];
  areaCenters?: Record<string, AreaCenter>;
  restaurants: Restaurant[];
  visits: Visit[];
}
