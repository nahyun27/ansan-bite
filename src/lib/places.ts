import type { PlaceResult, PlacesResponse } from '../../api/places';
import type { AreaCenter, Restaurant } from '../types';
import { distanceMeters } from './utils';

export type { PlaceResult };

interface SearchParams {
  query?: string;
  /** FD6 = 음식점. 빈 문자열이면 전체(기준 위치 찾기용) */
  category?: 'FD6' | '';
  center?: { x: number; y: number };
  radius?: number;
  page?: number;
}

export async function searchPlaces(p: SearchParams): Promise<PlacesResponse> {
  const params = new URLSearchParams({ page: String(p.page ?? 1), category: p.category ?? 'FD6' });
  if (p.query) params.set('query', p.query);
  if (p.center) {
    params.set('x', String(p.center.x));
    params.set('y', String(p.center.y));
    params.set('radius', String(p.radius ?? 1000));
  }
  let res: Response;
  try {
    res = await fetch(`/api/places?${params}`);
  } catch {
    throw new Error('인터넷 연결을 확인해 주세요.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `검색에 실패했어요 (${res.status})`);
  return body as PlacesResponse;
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
  간식: '카페·디저트',
};

/** "음식점 > 한식 > 해장국" → { category: '한식', detail: '해장국' } */
export function parseCategory(categoryName: string): { category: string; detail: string } {
  const parts = categoryName.split('>').map((s) => s.trim());
  const main = parts[1] ?? '';
  return { category: CATEGORY_MAP[main] ?? '기타', detail: parts.length >= 3 ? parts[parts.length - 1] : '' };
}

/** 직선거리 기준 도보 태그 (분당 약 80m) */
export function walkTag(meters: number): string | null {
  if (meters <= 400) return '도보 5분';
  if (meters <= 800) return '도보 10분';
  return null;
}

export function placeToRestaurant(place: PlaceResult, area: string, center: AreaCenter | undefined, id: string): Restaurant {
  const { category, detail } = parseCategory(place.categoryName);
  const meters = center ? distanceMeters(center, place) : place.distance;
  const tag = meters !== null && meters !== undefined ? walkTag(meters) : null;
  return {
    id,
    name: place.name,
    area,
    category,
    menu: detail, // 카카오 세부 분류(예: 해장국)를 대표 메뉴 초안으로
    goodFor: ['혼밥', '친구랑'],
    tags: tag ? [tag] : [],
    mapUrl: place.url,
    kakaoId: place.id,
    address: place.roadAddress || place.address,
    phone: place.phone || undefined,
    coords: { x: place.x, y: place.y },
  };
}

export function isAlreadySaved(place: PlaceResult, restaurants: Restaurant[]): boolean {
  return restaurants.some((r) => r.kakaoId === place.id || (r.name === place.name && !r.id.startsWith('seed-')));
}
