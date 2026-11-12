import type { AppData } from '../types';
import { AUTO_TAGS, HEALTHY_TAG, createInitialData, isLegacyExample } from '../data/defaults';
import { guessAutoTags, guessCategory, guessHealthy } from './guessCategory';
import { sortVisitsDesc } from './utils';

/** 자동 태그 규칙이 바뀌면 올려서 기존 식당에 한 번 더 채움 */
export const AUTO_TAGS_VERSION = 2;

const KEY = 'ansan-bite:data';

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = parseAppData(raw);
      if (parsed) return normalizeData(parsed);
    }
  } catch {
    // 저장소 접근 불가(사생활 보호 모드 등) → 빈 상태로 시작
  }
  return createInitialData();
}

/** 불러온 데이터(로컬 저장·백업 파일)를 최신 형식으로 */
export function normalizeData(data: AppData): AppData {
  return backfillAutoTags(migrateCategories(removeLegacyExamples(migrateRatings(migrateMenus(data)))));
}

/** 예전 3단계 평가(visit.rating) → 별점. 또 갈래 5 / 무난해 3 / 내 취향 아님 1, 식당 별점은 가장 최근 평가 */
const RATING_TO_STARS: Record<string, number> = { again: 5, okay: 3, nope: 1 };
export function migrateRatings(data: AppData): AppData {
  type OldVisit = (typeof data.visits)[number] & { rating?: string };
  if (!(data.visits as OldVisit[]).some((v) => v.rating)) return data;
  const visits = (data.visits as OldVisit[]).map(({ rating, ...v }) =>
    rating && v.stars === undefined ? { ...v, stars: RATING_TO_STARS[rating] } : v,
  );
  const latest = new Map<string, number>();
  for (const v of sortVisitsDesc(visits)) {
    if (v.stars && !latest.has(v.restaurantId)) latest.set(v.restaurantId, v.stars);
  }
  return {
    ...data,
    visits,
    restaurants: data.restaurants.map((r) => (r.stars === undefined && latest.has(r.id) ? { ...r, stars: latest.get(r.id) } : r)),
  };
}

/** 예전 형식: menu(문자열 하나) → menus(목록) */
export function migrateMenus(data: AppData): AppData {
  if (data.restaurants.every((r) => Array.isArray(r.menus))) return data;
  return {
    ...data,
    restaurants: data.restaurants.map((r) => {
      if (Array.isArray(r.menus)) return r;
      const { menu, ...rest } = r as typeof r & { menu?: string };
      return { ...rest, menus: menu?.trim() ? [menu.trim()] : [] };
    }),
  };
}

/** 예전 '카페·디저트' 분류 → 카페 / 빵집 / 디저트 */
export function migrateCategories(data: AppData): AppData {
  if (!data.restaurants.some((r) => r.category === '카페·디저트')) return data;
  return {
    ...data,
    restaurants: data.restaurants.map((r) => {
      if (r.category !== '카페·디저트') return r;
      const g = guessCategory(r.name, r.menus.join(' '));
      return { ...r, category: g && ['카페', '빵집', '디저트'].includes(g.category) ? g.category : '카페' };
    }),
  };
}

/** 예전에 등록한 식당에 자동 태그를 버전마다 한 번씩만 붙임 (이후엔 사용자가 뺀 걸 존중) */
export function backfillAutoTags(data: AppData): AppData {
  const from = data.autoTagsVersion ?? 0;
  if (from >= AUTO_TAGS_VERSION) return data;
  return {
    ...data,
    autoTagsVersion: AUTO_TAGS_VERSION,
    restaurants: data.restaurants.map((r) => {
      let tags = r.tags;
      // v1: 가볍게/자극적·술집·카페 용도 — 이미 자동 태그가 하나라도 있으면 손대지 않음
      if (from < 1 && !tags.some((t) => AUTO_TAGS.includes(t))) {
        tags = [...guessAutoTags(r.name, r.menus.join(' '), r.category).filter((t) => t !== HEALTHY_TAG), ...tags];
      }
      // v2: 건강식
      if (from < 2 && !tags.includes(HEALTHY_TAG) && guessHealthy(r.name, r.menus.join(' '))) tags = [HEALTHY_TAG, ...tags];
      return tags === r.tags ? r : { ...r, tags };
    }),
  };
}

/** 예전 버전의 예시 식당(가짜 데이터)과 그 방문 기록 제거. 직접 등록한 식당은 유지 */
export function removeLegacyExamples(data: AppData): AppData {
  if (!data.restaurants.some((r) => isLegacyExample(r.id))) return data;
  return {
    ...data,
    restaurants: data.restaurants.filter((r) => !isLegacyExample(r.id)),
    visits: data.visits.filter((v) => !isLegacyExample(v.restaurantId)),
  };
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 저장 실패는 조용히 무시 (메모리 상태는 유지)
  }
}

/** JSON 문자열을 검증해 AppData로 변환. 형식이 틀리면 null. */
export function parseAppData(raw: string): AppData | null {
  try {
    const d = JSON.parse(raw);
    if (
      d &&
      d.version === 1 &&
      Array.isArray(d.areas) &&
      Array.isArray(d.restaurants) &&
      Array.isArray(d.visits) &&
      d.restaurants.every(
        (r: unknown) =>
          typeof r === 'object' && r !== null &&
          typeof (r as Record<string, unknown>).id === 'string' &&
          typeof (r as Record<string, unknown>).name === 'string' &&
          typeof (r as Record<string, unknown>).area === 'string' &&
          ['number', 'undefined'].includes(typeof (r as Record<string, unknown>).price),
      )
    ) {
      return d as AppData;
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

export function exportFileName(today: string): string {
  return `ansan-bite-backup-${today}.json`;
}
