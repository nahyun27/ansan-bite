import type { PriceLevel, Restaurant, Visit } from '../types';

export function newId(): string {
  // crypto.randomUUID는 https/localhost에서만 동작 → LAN 테스트 대비 fallback
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && globalThis.isSecureContext) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function toDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** a에서 b까지 지난 일수 (둘 다 YYYY-MM-DD) */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function formatPrice(won: number | undefined): string {
  if (won === undefined) return '가격 미입력';
  const rounded = Math.round(won / 1000) * 1000; // 천 원 단위 반올림
  if (rounded < 10000) return `약 ${Math.max(rounded, 1000) / 1000}천 원`;
  const man = Math.round(rounded / 1000) / 10; // 1.1만, 1.5만 …
  return `약 ${man}만 원`;
}

export function relativeDay(date: string, today: string): string {
  const d = daysBetween(date, today);
  if (d === 0) return '오늘';
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  if (d < 30) return `${Math.floor(d / 7)}주 전`;
  return `${Math.floor(d / 30)}달 전`;
}

/** 방문 기록을 최신순으로 (같은 날짜면 뒤에 추가된 것이 최신) */
export function sortVisitsDesc(visits: Visit[]): Visit[] {
  return visits
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v.date === b.v.date ? b.i - a.i : a.v.date < b.v.date ? 1 : -1))
    .map((x) => x.v);
}

export function lastVisitDate(restaurantId: string, visits: Visit[]): string | undefined {
  return sortVisitsDesc(visits).find((v) => v.restaurantId === restaurantId)?.date;
}

export function naverMapSearchUrl(name: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(`안산 ${name}`)}`;
}

/** 두 좌표 사이 직선거리(m) */
export function distanceMeters(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.y - a.y);
  const dLng = toRad(b.x - a.x);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.y)) * Math.cos(toRad(b.y)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

/** 1인 가격 → 가격대 (1만 원 미만 / 2만 원 미만 / 그 이상) */
export function levelFromPrice(won: number): PriceLevel {
  if (won < 10000) return '싼 곳';
  if (won < 20000) return '보통';
  return '비싼 곳';
}

/** 식당의 가격대: 직접 고른 값 → 없으면 가격으로 계산 → 둘 다 없으면 undefined */
export function priceLevelOf(r: Pick<Restaurant, 'priceLevel' | 'price'>): PriceLevel | undefined {
  return r.priceLevel ?? (r.price !== undefined ? levelFromPrice(r.price) : undefined);
}

/** 카드·목록에 보여줄 가격: 정확한 가격 > 가격대 > 미입력 */
export function priceText(r: Pick<Restaurant, 'priceLevel' | 'price'>): string {
  if (r.price !== undefined) return formatPrice(r.price);
  return r.priceLevel ?? '가격 미입력';
}

/** 메뉴나 가격대가 비어 있으면 정보 보충 필요 */
export const needsInfo = (r: Pick<Restaurant, 'menus' | 'priceLevel' | 'price'>) => r.menus.length === 0 || priceLevelOf(r) === undefined;
