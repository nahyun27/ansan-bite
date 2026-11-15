/** 카카오 장소 검색 (지도 JavaScript SDK — VITE_KAKAO_JS_KEY 하나로 지도·검색 모두) */
import type { AreaCenter, Restaurant } from '../types';
import { guessAutoTags } from './guessCategory';
import { categorySearch, keywordSearch, loadKakao, type KakaoPlace } from './kakaoSdk';

export interface PlaceResult {
  id: string;
  name: string;
  /** 예: "음식점 > 한식 > 해장국" */
  categoryName: string;
  phone: string;
  address: string;
  roadAddress: string;
  /** 경도 */
  x: number;
  /** 위도 */
  y: number;
  url: string;
  /** 기준 좌표로부터 거리(m) */
  distance: number | null;
}

export interface PlacesResponse {
  places: PlaceResult[];
  isEnd: boolean;
}

interface SearchParams {
  query?: string;
  /** FD6 = 음식점, CE7 = 카페. 빈 문자열이면 전체(기준 위치 찾기용) */
  category?: 'FD6' | 'CE7' | '';
  center?: { x: number; y: number };
  radius?: number;
  page?: number;
}

export const toPlaceResult = (d: KakaoPlace): PlaceResult => ({
  id: d.id,
  name: d.place_name,
  categoryName: d.category_name,
  phone: d.phone,
  address: d.address_name,
  roadAddress: d.road_address_name,
  x: Number(d.x),
  y: Number(d.y),
  url: d.place_url,
  distance: d.distance ? Number(d.distance) : null,
});

export async function searchPlaces(p: SearchParams): Promise<PlacesResponse> {
  const kakao = await loadKakao();
  const opts: Record<string, unknown> = { page: p.page ?? 1, size: 15 };
  if (p.category) opts.category_group_code = p.category;
  if (p.center) {
    opts.location = new kakao.maps.LatLng(p.center.y, p.center.x);
    opts.radius = Math.min(p.radius ?? 1000, 20000);
  }
  if (!p.query && !(p.category && p.center)) throw new Error('검색어를 넣어주세요.');
  const r = p.query ? await keywordSearch(kakao, p.query, opts) : await categorySearch(kakao, p.category!, opts);
  return { places: r.places.map(toPlaceResult), isEnd: !r.hasNext };
}

/** 검색어로 기준 위치 찾기 (첫 번째 결과) */
export async function findCenter(query: string): Promise<AreaCenter | null> {
  const { places } = await searchPlaces({ query, category: '' });
  const first = places[0];
  return first ? { label: first.name, x: first.x, y: first.y } : null;
}

const CATEGORY_MAP: Record<string, string> = {
  한식: '한식',
  중식: '중식',
  일식: '일식',
  양식: '양식',
  분식: '분식',
  아시아음식: '아시안',
  패스트푸드: '양식',
  간식: '디저트',
  제과: '빵집',
  베이커리: '빵집',
};

/** "음식점 > 한식 > 해장국" → { category: '한식', detail: '해장국' } */
export function parseCategory(categoryName: string): { category: string; detail: string } {
  const parts = categoryName.split('>').map((s) => s.trim());
  const main = parts[1] ?? '';
  // 세 번째 칸(예: 국밥, 커피전문점). 맨 끝 칸은 프랜차이즈 이름일 때가 있어서 쓰지 않음
  const detail = parts[2] ?? '';
  if (/제과|베이커리/.test(categoryName)) return { category: '빵집', detail: '빵' };
  if (main === '카페' || parts[0] === '카페') return { category: '카페', detail };
  return { category: CATEGORY_MAP[main] ?? '기타', detail };
}

export function placeToRestaurant(place: PlaceResult, area: string, _center: AreaCenter | undefined, id: string): Restaurant {
  const { category, detail } = parseCategory(place.categoryName);
  return {
    id,
    name: place.name,
    area,
    category,
    menus: detail ? [detail] : [], // 카카오 세부 분류(예: 해장국)를 대표 메뉴 초안으로
    goodFor: ['혼밥', '친구랑'],
    // 이름·분류로 자동 태그 (가볍게/자극적/술집/건강식, 카페 용도). 도보 태그는 쓰지 않기로 함
    tags: guessAutoTags(place.name, detail, category),
    mapUrl: place.url,
    kakaoId: place.id,
    address: place.roadAddress || place.address,
    phone: place.phone || undefined,
    coords: { x: place.x, y: place.y },
    coordsSource: 'kakao',
    kakaoUrl: place.url,
    kakaoTried: true,
  };
}

export function isAlreadySaved(place: PlaceResult, restaurants: Restaurant[]): boolean {
  return restaurants.some((r) => r.kakaoId === place.id || r.name === place.name);
}
