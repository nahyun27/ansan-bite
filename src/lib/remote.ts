/** 공유 목록 서버(/api/data)와 주고받기 + 이 기기에 남겨두는 동기화 정보 */
import type { Snapshot } from '../../api/data';
import type { AppData, Restaurant, Visit } from '../types';
import { migrateCategories, migrateMenus } from './storage';

export type { Snapshot };

export interface Session {
  token: string;
  nick: string;
}

/** 예전 공유 비밀번호 방식으로 저장된 로그인 (가입할 때 예전 닉네임 확인용으로만 씀) */
export interface LegacySession {
  passcode: string;
  nick: string;
}

export type Op =
  | { op: 'upsertRestaurant'; restaurant: Restaurant }
  | { op: 'deleteRestaurant'; id: string }
  | { op: 'addArea'; area: string }
  | { op: 'removeArea'; area: string }
  | { op: 'setStars'; restaurantId: string; stars: number | null };

export interface SyncMeta {
  /** 서버에 있는 내 먹은 기록의 버전 */
  personalVersion: number;
  /** 이 기기의 데이터를 공유 목록에 한 번 올렸는지 (처음 로그인할 때) */
  initialized: boolean;
  /** 마지막으로 서버와 맞춘 먹은 기록(JSON). 이것과 다르면 이 기기에서 바뀐 것 */
  personalSynced?: string;
}

export type Result<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'disabled' } // 서버 저장소가 설정 안 됨 → 로컬 저장만
  | { kind: 'unauthorized'; message: string; code?: string }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; value: { personal: { visits: Visit[] } | null; version: number } };

// ---- 이 기기에 저장 ----
const KEYS = { session: 'ansan-bite:session', outbox: 'ansan-bite:outbox', meta: 'ansan-bite:sync' };
const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시 */
  }
};

/** 저장된 로그인. 예전 방식(공유 비밀번호)이면 session은 없고 legacy로 */
export function loadSession(): { session: Session | null; legacy: LegacySession | null } {
  const raw = read<(Partial<Session> & Partial<LegacySession>) | null>(KEYS.session, null);
  if (raw?.token && raw.nick) return { session: { token: raw.token, nick: raw.nick }, legacy: null };
  if (raw?.passcode && raw.nick) return { session: null, legacy: { passcode: raw.passcode, nick: raw.nick } };
  return { session: null, legacy: null };
}
export const saveSession = (s: Session | null) => write(KEYS.session, s);
export const loadOutbox = () => read<Op[]>(KEYS.outbox, []);
export const saveOutbox = (ops: Op[]) => write(KEYS.outbox, ops);
export const loadMeta = () => read<SyncMeta>(KEYS.meta, { personalVersion: 0, initialized: false });
export const saveMeta = (m: SyncMeta | null) => write(KEYS.meta, m);

// ---- 서버 요청 ----
async function request<T>(session: Session | null, init: RequestInit): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch('/api/data', {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      },
    });
  } catch {
    return { kind: 'offline' };
  }
  const body = await res.json().catch(() => null);
  if (res.ok) return { kind: 'ok', value: body as T };
  if (res.status === 503 && body?.disabled) return { kind: 'disabled' };
  if (res.status === 404) return { kind: 'disabled' }; // API가 없는 환경
  if (res.status === 401) return { kind: 'unauthorized', message: body?.error ?? '', code: body?.code };
  if (res.status === 409) return { kind: 'conflict', value: body };
  return { kind: 'error', message: body?.error ?? `서버 오류 (${res.status})` };
}

/** 가입·로그인: 성공하면 토큰, 실패하면 이유(code: taken·legacy 등) */
export async function authenticate(
  mode: 'signup' | 'login',
  nick: string,
  password: string,
  legacyPasscode?: string,
): Promise<{ ok: true; session: Session } | { ok: false; message: string; code?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: mode, nick, password, legacyPasscode }),
    });
  } catch {
    return { ok: false, message: '인터넷 연결을 확인해 주세요.' };
  }
  const body = await res.json().catch(() => null);
  if (res.ok && body?.token) return { ok: true, session: { token: body.token, nick: body.nick } };
  if (res.status === 404 || (res.status === 503 && body?.disabled)) return { ok: false, message: '서버 저장소가 아직 설정되지 않았어요.' };
  return { ok: false, message: body?.error ?? `서버 오류 (${res.status})`, code: body?.code };
}

export const logoutRemote = (session: Session) => request(session, { method: 'POST', body: JSON.stringify({ op: 'logout' }) });

export const fetchSnapshot = (session: Session | null) => request<Snapshot>(session, { method: 'GET' });
export const sendOp = (session: Session, op: Op) => request<{ ok: true }>(session, { method: 'POST', body: JSON.stringify(op) });
export const putPersonal = (session: Session, visits: Visit[], baseVersion: number) =>
  request<{ version: number }>(session, { method: 'POST', body: JSON.stringify({ op: 'putPersonal', personal: { visits }, baseVersion }) });

// ---- 합치기 ----

/** 서버로 보낼 식당: 내 별점은 따로(setStars) 보내므로 뺌 */
export function sharedPart(r: Restaurant): Restaurant {
  const { stars: _mine, ...rest } = r;
  void _mine;
  return rest;
}

/** 아직 못 보낸 변경을 데이터 위에 다시 적용 */
export function applyOps(data: AppData, ops: Op[], nick: string): AppData {
  let d = data;
  for (const o of ops) {
    switch (o.op) {
      case 'upsertRestaurant': {
        const exists = d.restaurants.some((r) => r.id === o.restaurant.id);
        const mine = d.restaurants.find((r) => r.id === o.restaurant.id)?.stars;
        const r = { ...o.restaurant, stars: mine };
        d = { ...d, restaurants: exists ? d.restaurants.map((x) => (x.id === r.id ? r : x)) : [...d.restaurants, r] };
        break;
      }
      case 'deleteRestaurant':
        d = { ...d, restaurants: d.restaurants.filter((r) => r.id !== o.id) };
        break;
      case 'addArea':
        if (!d.areas.includes(o.area)) d = { ...d, areas: [...d.areas, o.area] };
        break;
      case 'removeArea':
        d = { ...d, areas: d.areas.filter((a) => a !== o.area) };
        break;
      case 'setStars': {
        const all = { ...d.allStars, [o.restaurantId]: { ...d.allStars?.[o.restaurantId] } };
        if (o.stars) all[o.restaurantId][nick] = o.stars;
        else delete all[o.restaurantId][nick];
        d = {
          ...d,
          allStars: all,
          restaurants: d.restaurants.map((r) => (r.id === o.restaurantId ? { ...r, stars: o.stars ?? undefined } : r)),
        };
        break;
      }
    }
  }
  return d;
}

/** 서버 스냅숏으로 공유 부분(식당·지역·별점)을 바꾸고, 못 보낸 변경을 다시 얹음. 먹은 기록은 따로 처리 */
export function mergeSnapshot(local: AppData, snap: Snapshot, nick: string, pending: Op[]): AppData {
  const fromServer: AppData = migrateCategories(
    migrateMenus({
      ...local,
      areas: snap.areas.length ? snap.areas : local.areas,
      allStars: snap.stars,
      restaurants: (snap.restaurants as unknown as Restaurant[]).map((r) => ({ ...r, stars: snap.stars[r.id]?.[nick] })),
    }),
  );
  return applyOps(fromServer, pending, nick);
}

/** 처음 로그인한 기기: 서버에 없는 내 식당·지역·별점을 올릴 변경 목록 */
export function initialUploadOps(local: AppData, snap: Snapshot, nick: string): Op[] {
  const onServer = new Set(snap.restaurants.map((r) => r.id as string));
  const ops: Op[] = [];
  for (const a of local.areas) if (!snap.areas.includes(a)) ops.push({ op: 'addArea', area: a });
  for (const r of local.restaurants) {
    if (!onServer.has(r.id)) ops.push({ op: 'upsertRestaurant', restaurant: { ...sharedPart(r), addedBy: r.addedBy ?? nick } });
    if (r.stars && snap.stars[r.id]?.[nick] === undefined) ops.push({ op: 'setStars', restaurantId: r.id, stars: r.stars });
  }
  return ops;
}

/** 먹은 기록 합치기 (같은 id는 이 기기 것 우선) */
export function mergeVisits(local: Visit[], remote: Visit[]): Visit[] {
  const ids = new Set(local.map((v) => v.id));
  return [...local, ...remote.filter((v) => !ids.has(v.id))];
}

/** 별점 평균 (아무도 안 매겼으면 undefined) */
export function averageStars(all: AppData['allStars'], restaurantId: string): { avg: number; count: number } | undefined {
  const values = Object.values(all?.[restaurantId] ?? {});
  if (!values.length) return undefined;
  return { avg: values.reduce((a, b) => a + b, 0) / values.length, count: values.length };
}
