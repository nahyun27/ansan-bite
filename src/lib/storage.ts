import type { AppData } from '../types';
import { createSeedData } from '../data/seed';

const KEY = 'ansan-bite:data';

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = parseAppData(raw);
      if (parsed) return parsed;
    }
  } catch {
    // 저장소 접근 불가(사생활 보호 모드 등) → 예시 데이터로 시작
  }
  return createSeedData();
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
