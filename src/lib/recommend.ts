import type { AppData, Companion, PriceLevel, Restaurant } from '../types';
import { currentRating, daysBetween, lastVisitDate, priceLevelOf, sortVisitsDesc } from './utils';
import { isCafeCategory } from '../data/defaults';

export type Kind = '밥' | '카페';

export interface Conditions {
  /** 밥이면 카페·빵집·디저트 제외, 카페면 그것만 */
  kind: Kind;
  area: string;
  companion: Companion;
  /** null = 상관없음 */
  priceLevel: PriceLevel | null;
  tags: string[];
}

export interface Recommendation {
  restaurant: Restaurant;
  score: number;
  reasons: string[];
}

export interface RecommendOptions {
  today: string;
  /** 식당 id → 0~10 랜덤 가산점. 버튼을 누를 때만 새로 만든다. */
  jitter: Record<string, number>;
  /** 이번에 이미 보여준 식당 (다른 곳 추천 시 제외) */
  exclude?: Set<string>;
  limit?: number;
}

export const WEIGHTS = {
  ratingAgain: 30,
  ratingOkay: 10,
  neverVisited: 15,
  within3Days: -40,
  within7Days: -20,
  over14Days: 10,
  sameCategoryRecent: -15,
  tagMatch: 10,
  jitterMax: 10,
} as const;

export function makeJitter(ids: string[], rand: () => number = Math.random): Record<string, number> {
  return Object.fromEntries(ids.map((id) => [id, rand() * WEIGHTS.jitterMax]));
}

/** 조건에 맞는 후보 (점수 계산 전 걸러내기) */
export function filterCandidates(data: AppData, c: Conditions): Restaurant[] {
  return data.restaurants.filter(
    (r) =>
      r.area === c.area &&
      isCafeCategory(r.category) === (c.kind === '카페') &&
      (c.priceLevel === null || priceLevelOf(r) === undefined || priceLevelOf(r) === c.priceLevel) &&
      r.goodFor.includes(c.companion) &&
      c.tags.every((t) => r.tags.includes(t)) &&
      currentRating(r.id, data.visits) !== 'nope',
  );
}

const COMPANION_REASON: Record<Companion, string> = {
  혼밥: '혼밥하기 편해요.',
  친구랑: '친구랑 가기 좋아요.',
  데이트: '데이트하기 좋아요.',
};

export function recommend(data: AppData, c: Conditions, opts: RecommendOptions): Recommendation[] {
  const { today, jitter, exclude = new Set(), limit = 3 } = opts;
  const recentCategories = sortVisitsDesc(data.visits)
    .slice(0, 2)
    .map((v) => data.restaurants.find((r) => r.id === v.restaurantId)?.category)
    .filter((x): x is string => !!x);

  const scored = filterCandidates(data, c)
    .filter((r) => !exclude.has(r.id))
    .map((r) => {
      let score = jitter[r.id] ?? 0;
      // 이유는 (우선순위, 문장)으로 모아서 우선순위가 높은 것부터 보여준다
      const reasons: [number, string][] = [];
      const rating = currentRating(r.id, data.visits);
      const last = lastVisitDate(r.id, data.visits);

      if (rating === 'again') {
        score += WEIGHTS.ratingAgain;
        reasons.push([30, '또 가고 싶다고 했던 곳이에요.']);
      } else if (rating === 'okay') {
        score += WEIGHTS.ratingOkay;
      }

      if (!last) {
        score += WEIGHTS.neverVisited;
        reasons.push([15, '아직 안 가본 곳이에요.']);
      } else {
        const days = daysBetween(last, today);
        if (days <= 3) score += WEIGHTS.within3Days;
        else if (days <= 7) score += WEIGHTS.within7Days;
        else if (days > 14) {
          score += WEIGHTS.over14Days;
          reasons.push([10, `${days}일 동안 안 갔어요.`]);
        }
      }

      if (recentCategories.includes(r.category)) {
        score += WEIGHTS.sameCategoryRecent;
      } else if (recentCategories.length > 0) {
        reasons.push([5, '최근에 안 먹은 메뉴예요.']);
      }

      for (const t of c.tags.filter((t) => r.tags.includes(t))) {
        score += WEIGHTS.tagMatch;
        reasons.push([20, `'${t}'에 딱이에요.`]);
      }

      if (r.tags.includes('도보 5분')) reasons.push([4, '걸어서 5분이면 가요.']);
      reasons.push([3, COMPANION_REASON[c.companion]]);

      return {
        restaurant: r,
        score,
        reasons: reasons.sort((a, b) => b[0] - a[0]).map(([, why]) => why),
      };
    });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
