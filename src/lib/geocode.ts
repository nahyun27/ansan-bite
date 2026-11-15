/**
 * 주소·이름으로 위치 찾기 (OpenStreetMap Nominatim, 무료·키 없음).
 * 이용 규칙: 1초에 1번 이하, 결과는 저장해서 다시 묻지 않기 → 찾은 위치는 공유 목록에 저장한다.
 * 정확한 번지를 못 찾으면 길 → 동네 단위로 '대략' 위치를 쓰고, 지도에서 직접 고칠 수 있게 한다.
 */
import type { Restaurant } from '../types';
import { addressSearch, keywordSearch, type KakaoNS, type KakaoPlace } from './kakaoSdk';

/** 안산 주변 (left, top, right, bottom) — 다른 도시의 같은 이름이 잡히지 않게 */
export const ANSAN_VIEWBOX = '126.70,37.42,126.98,37.22';
export const ANSAN_CENTER = { x: 126.835, y: 37.2967 }; // 한양대 ERICA 근처

export interface GeoResult {
  coords: { x: number; y: number };
  source: 'exact' | 'approx';
}

interface NominatimItem {
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string>;
}

/** "경기 안산시 상록구 한양대학로 55 2층 201호" → "경기 안산시 상록구 한양대학로 55" (도로명·지번 번지까지만) */
export function trimToNumber(address: string): string {
  const m = address.match(/^(.*?(?:로|길|동|리|가)\s*\d+(?:-\d+)?)/);
  return (m ? m[1] : address).trim();
}

/** 번지를 뺀 길 이름까지: "… 고잔로 54" → "… 고잔로" / 지번이면 동까지: "… 사동 1271" → "… 사동" */
export function trimToStreet(address: string): string | null {
  const m = trimToNumber(address).match(/^(.*?(?:로|길|동|리|가))\s*\d/);
  return m ? m[1].trim() : null;
}

/** 구·동 단위: "경기 안산시 상록구 사동 …" → "경기 안산시 상록구 사동" */
export function trimToDong(address: string): string | null {
  const m = address.match(/^(.*?[가-힣]+(?:동|읍|면))(?:\s|$)/);
  return m ? m[1].trim() : null;
}

/** 시도할 검색어 목록 (앞에서부터, 정확한 것 → 대략) */
export function queriesFor(r: Pick<Restaurant, 'name' | 'address'>): { q: string; poi: boolean }[] {
  const out: { q: string; poi: boolean }[] = [];
  const add = (q: string | null | undefined, poi = false) => {
    if (q && !out.some((x) => x.q === q)) out.push({ q, poi });
  };
  if (r.address) add(trimToNumber(r.address));
  add(r.name, true);
  if (r.address) {
    add(trimToStreet(r.address));
    add(trimToDong(r.address));
  }
  return out;
}

/** 번지·가게까지 찾았으면 정확, 길·동네면 대략 */
export function isExact(item: NominatimItem, poi: boolean): boolean {
  if (item.address?.house_number) return true;
  if (poi && ['amenity', 'shop', 'tourism', 'leisure'].includes(item.category ?? '')) return true;
  return ['building', 'house', 'amenity', 'shop'].includes(item.addresstype ?? '');
}

let last = 0;
async function throttle() {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

async function search(q: string): Promise<NominatimItem | null> {
  await throttle();
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'kr',
    viewbox: ANSAN_VIEWBOX,
    bounded: '1',
    addressdetails: '1',
    'accept-language': 'ko',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`위치 검색 오류 (${res.status})`);
  const items = (await res.json()) as NominatimItem[];
  return items[0] ?? null;
}

/** 식당 하나의 위치 찾기. 아무것도 못 찾으면 null */
export async function geocodeRestaurant(r: Pick<Restaurant, 'name' | 'address'>): Promise<GeoResult | null> {
  let approx: GeoResult | null = null;
  for (const { q, poi } of queriesFor(r)) {
    const item = await search(q);
    if (!item) continue;
    const result: GeoResult = { coords: { x: Number(item.lon), y: Number(item.lat) }, source: isExact(item, poi) ? 'exact' : 'approx' };
    if (result.source === 'exact') return result;
    approx ??= result; // 대략이라도 일단 기억하고 더 정확한 걸 찾아봄
  }
  return approx;
}

// ---- 카카오 (키가 있을 때) ----

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 이름 검색 결과 중 이 식당으로 볼 만한 것 고르기 */
export function pickKakaoPlace(places: KakaoPlace[], r: Pick<Restaurant, 'name' | 'address'>): KakaoPlace | null {
  const inAnsan = places.filter((p) => /안산/.test(p.address_name) || /안산/.test(p.road_address_name));
  if (!inAnsan.length) return null;
  const name = norm(r.name);
  const addr = r.address ? norm(trimToNumber(r.address)) : '';
  // 1) 주소가 같은 곳 2) 이름이 같거나 서로 포함 3) 결과가 하나뿐이면 그것
  return (
    (addr && inAnsan.find((p) => norm(p.road_address_name).startsWith(addr) || norm(p.address_name).startsWith(addr))) ||
    inAnsan.find((p) => norm(p.place_name) === name) ||
    inAnsan.find((p) => norm(p.place_name).includes(name) || name.includes(norm(p.place_name))) ||
    (inAnsan.length === 1 ? inAnsan[0] : null)
  );
}

export interface KakaoGeoResult {
  coords: { x: number; y: number };
  kakaoId?: string;
  kakaoUrl?: string;
}

/** 카카오로 위치 찾기: 이름(안산 근처) → 주소 */
export async function geocodeKakao(kakao: KakaoNS, r: Pick<Restaurant, 'name' | 'address'>): Promise<KakaoGeoResult | null> {
  const center = new kakao.maps.LatLng(ANSAN_CENTER.y, ANSAN_CENTER.x);
  const { places } = await keywordSearch(kakao, r.name, { location: center, radius: 20000 });
  const hit = pickKakaoPlace(places, r);
  if (hit) return { coords: { x: Number(hit.x), y: Number(hit.y) }, kakaoId: hit.id, kakaoUrl: hit.place_url };
  if (r.address) {
    const found = (await addressSearch(kakao, trimToNumber(r.address))) ?? (await addressSearch(kakao, r.address));
    if (found) return { coords: found };
  }
  return null;
}

/**
 * 위치를 (다시) 찾아야 하는 식당
 * - 직접 찍었거나 카카오로 찾은 곳은 그대로
 * - 카카오가 있으면: 위치가 없거나 무료 지도로 '대략'·'못 찾음'인 곳을 카카오로 한 번씩
 * - 무료 지도만: 위치가 없고 아직 안 찾아본 곳
 */
export function needsLookup(r: Restaurant, kakao: boolean): boolean {
  const src = r.coordsSource;
  if (src === 'manual' || src === 'kakao' || src === 'notfound') return false;
  if (kakao) return !r.kakaoTried && (!r.coords || src === 'approx' || src === 'none');
  return !r.coords && src !== 'none';
}

