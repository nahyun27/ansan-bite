export type Companion = '혼밥' | '친구랑' | '데이트';
export type PriceLevel = '싼 곳' | '보통' | '비싼 곳';

export const PRICE_LEVELS: PriceLevel[] = ['싼 곳', '보통', '비싼 곳'];

export const COMPANIONS: Companion[] = ['혼밥', '친구랑', '데이트'];
/** 별점 1~5. 1점은 '내 취향 아님'으로 보고 추천에서 제외 */
export const STAR_LABEL: Record<number, string> = { 1: '내 취향 아님', 2: '별로', 3: '무난해', 4: '좋아', 5: '또 갈래' };

export interface Restaurant {
  id: string;
  name: string;
  /** 자유 문자열 — 사용자가 새 지역을 추가할 수 있음 */
  area: string;
  category: string;
  /** 대표 메뉴 (여러 개) */
  menus: string[];
  /** 가격대. 비우면 price로 계산, 둘 다 없으면 가격 조건에 걸러지지 않고 '보충 필요'로 표시 */
  priceLevel?: PriceLevel;
  /** 1인 대략 가격(원), 선택 */
  price?: number;
  goodFor: Companion[];
  tags: string[];
  mapUrl?: string;
  memo?: string;
  /** 내 별점 1~5 (식당의 현재 평가는 이 값 하나) */
  stars?: number;
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
  /** 그날 먹고 남긴 별점 (기록용). 남기면 식당 별점도 이 값으로 바뀜 */
  stars?: number;
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
  /** 기존 식당에 자동 태그(가볍게/자극적/술집)를 채운 규칙 버전 */
  autoTagsVersion?: number;
  restaurants: Restaurant[];
  visits: Visit[];
}
