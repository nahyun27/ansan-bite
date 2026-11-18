import { describe, expect, it, vi } from 'vitest';
import { checkPassword, cleanNick, handleData, hashPassword, upstashStore, type DataEnv, type Snapshot, type Store } from '../api/data';

/** 테스트용 메모리 저장소 */
function memoryStore() {
  const restaurants = new Map<string, string>();
  const areas: string[] = [];
  const stars = new Map<string, number>();
  const personal = new Map<string, { json: string; v: number }>();
  const accounts = new Map<string, string>();
  const sessions = new Map<string, string>();
  const hits = new Map<string, number>();
  const store: Store = {
    async snapshot(nick) {
      const s: Snapshot['stars'] = {};
      for (const [k, v] of stars) {
        const [rid, n] = k.split('|');
        (s[rid] ??= {})[n] = v;
      }
      const p = nick ? personal.get(nick) : undefined;
      return {
        restaurants: [...restaurants.values()].map((j) => JSON.parse(j)),
        areas: [...areas],
        stars: s,
        personal: p ? JSON.parse(p.json) : null,
        personalVersion: p?.v ?? 0,
      };
    },
    async getRestaurant(id) { return restaurants.get(id) ?? null; },
    async upsertRestaurant(id, json) { restaurants.set(id, json); },
    async deleteRestaurant(id) { restaurants.delete(id); },
    async addArea(a) { if (!areas.includes(a)) areas.push(a); },
    async removeArea(a) { areas.splice(areas.indexOf(a), 1); },
    async setStars(rid, nick, s) { if (s) stars.set(`${rid}|${nick}`, s); else stars.delete(`${rid}|${nick}`); },
    async putPersonal(nick, expected, json) {
      const cur = personal.get(nick)?.v ?? 0;
      if (cur !== expected) return { ok: false, version: cur };
      personal.set(nick, { json, v: cur + 1 });
      return { ok: true, version: cur + 1 };
    },
    async getAccount(nick) { return accounts.get(nick) ?? null; },
    async createAccount(nick, json) { if (accounts.has(nick)) return false; accounts.set(nick, json); return true; },
    async nickHasData(nick) { return personal.has(nick) || [...stars.keys()].some((k) => k.endsWith(`|${nick}`)); },
    async sessionNick(h) { return sessions.get(h) ?? null; },
    async createSession(h, nick) { sessions.set(h, nick); },
    async deleteSession(h) { sessions.delete(h); },
    async hit(key) { const n = (hits.get(key) ?? 0) + 1; hits.set(key, n); return n; },
  };
  return store;
}

const ENV: DataEnv = { passcode: 'old-shared', admins: ['관리자'] };
const call = (s: Store, method: string, body?: unknown, token?: string, env = ENV) =>
  handleData(
    new Request('http://x/api/data', {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    s,
  );
const signup = async (s: Store, nick: string, extra: Record<string, unknown> = {}) => {
  const res = await call(s, 'POST', { op: 'signup', nick, password: 'pw1234', ...extra });
  return (await res.json()).token as string;
};
const snapshot = async (s: Store, token?: string) => (await (await call(s, 'GET', undefined, token)).json()) as Snapshot & { admin: boolean };
const restaurant = { id: 'r1', name: '마라공방', area: '학교 근처', category: '중식', menus: ['마라탕'], goodFor: ['혼밥'], tags: [], stars: 5 };

describe('handleData', () => {
  it('저장소가 없으면 503 (앱은 로컬 저장으로 동작)', async () => {
    const res = await handleData(new Request('http://x/api/data'), ENV, null);
    expect(res.status).toBe(503);
    expect((await res.json()).disabled).toBe(true);
  });

  it('로그인 없이 목록·별점 구경은 되고, 바꾸기는 401', async () => {
    const s = memoryStore();
    const t = await signup(s, '나현');
    await call(s, 'POST', { op: 'upsertRestaurant', restaurant }, t);
    await call(s, 'POST', { op: 'setStars', restaurantId: 'r1', stars: 5 }, t);
    const pub = await snapshot(s);
    expect(pub.restaurants).toHaveLength(1);
    expect(pub.stars).toEqual({ r1: { 나현: 5 } });
    expect(pub.personal).toBeNull();
    const res = await call(s, 'POST', { op: 'setStars', restaurantId: 'r1', stars: 1 });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('login');
  });

  it('가입 → 로그인, 틀린 비밀번호·중복 닉네임·만료된 토큰', async () => {
    const s = memoryStore();
    expect(await signup(s, '친구')).toBeTruthy();
    const dup = await call(s, 'POST', { op: 'signup', nick: '친구', password: 'other1' });
    expect(dup.status).toBe(409);
    expect((await dup.json()).code).toBe('taken');
    expect((await call(s, 'POST', { op: 'login', nick: '친구', password: 'wrong!' })).status).toBe(401);
    const ok = await call(s, 'POST', { op: 'login', nick: '친구', password: 'pw1234' });
    expect(await ok.json()).toMatchObject({ nick: '친구' });
    expect((await call(s, 'GET', undefined, 'not-a-token')).status).toBe(401);
    expect((await call(s, 'POST', { op: 'signup', nick: 'x', password: '12' })).status).toBe(400);
  });

  it('로그아웃하면 그 토큰은 못 씀', async () => {
    const s = memoryStore();
    const t = await signup(s, '친구');
    expect((await call(s, 'POST', { op: 'logout' }, t)).status).toBe(200);
    expect((await call(s, 'GET', undefined, t)).status).toBe(401);
  });

  it('예전 공유 비밀번호 시절 닉네임은 그 비밀번호가 있어야 가입', async () => {
    const s = memoryStore();
    await s.setStars('r1', '나현', 5); // 예전에 남긴 별점
    const no = await call(s, 'POST', { op: 'signup', nick: '나현', password: 'pw1234' });
    expect(no.status).toBe(403);
    expect((await no.json()).code).toBe('legacy');
    expect((await call(s, 'POST', { op: 'signup', nick: '나현', password: 'pw1234', legacyPasscode: 'nope' })).status).toBe(403);
    const t = await signup(s, '나현', { legacyPasscode: 'old-shared' });
    expect((await snapshot(s, t)).stars).toEqual({ r1: { 나현: 5 } });
  });

  it('식당 추가: 별점(개인)은 빼고 저장, 처음 추가한 사람은 서버가 정함', async () => {
    const s = memoryStore();
    const a = await signup(s, '나현');
    const b = await signup(s, '친구');
    await call(s, 'POST', { op: 'upsertRestaurant', restaurant }, a);
    // 친구가 고치면서 addedBy를 바꿔 보내도 그대로
    await call(s, 'POST', { op: 'upsertRestaurant', restaurant: { ...restaurant, menus: ['꿔바로우'], addedBy: '친구' } }, b);
    const r = (await snapshot(s)).restaurants[0];
    expect(r).toMatchObject({ addedBy: '나현', updatedBy: '친구', menus: ['꿔바로우'] });
    expect(r).not.toHaveProperty('stars');
  });

  it('지우기는 직접 추가한 사람과 관리자만', async () => {
    const s = memoryStore();
    const a = await signup(s, '나현');
    const b = await signup(s, '친구');
    const admin = await signup(s, '관리자');
    await call(s, 'POST', { op: 'upsertRestaurant', restaurant }, a);
    await call(s, 'POST', { op: 'upsertRestaurant', restaurant: { ...restaurant, id: 'r2' } }, a);
    expect((await call(s, 'POST', { op: 'deleteRestaurant', id: 'r1' }, b)).status).toBe(403);
    expect((await call(s, 'POST', { op: 'deleteRestaurant', id: 'r1' }, a)).status).toBe(200);
    expect((await call(s, 'POST', { op: 'deleteRestaurant', id: 'r2' }, admin)).status).toBe(200);
    expect((await snapshot(s)).restaurants).toHaveLength(0);
    expect((await snapshot(s, admin)).admin).toBe(true);
    expect((await snapshot(s, b)).admin).toBe(false);
  });

  it('별점은 사람마다 따로', async () => {
    const s = memoryStore();
    const a = await signup(s, '나현');
    const b = await signup(s, '친구');
    await call(s, 'POST', { op: 'setStars', restaurantId: 'r1', stars: 5 }, a);
    await call(s, 'POST', { op: 'setStars', restaurantId: 'r1', stars: 3 }, b);
    expect((await snapshot(s)).stars).toEqual({ r1: { 나현: 5, 친구: 3 } });
    expect((await call(s, 'POST', { op: 'setStars', restaurantId: 'r1', stars: 9 }, a)).status).toBe(400);
  });

  it('먹은 기록은 사람마다 따로 + 버전이 다르면 409', async () => {
    const s = memoryStore();
    const a = await signup(s, '나현');
    const b = await signup(s, '친구');
    const visits = [{ id: 'v1', restaurantId: 'r1', date: '2026-11-13' }];
    expect(await (await call(s, 'POST', { op: 'putPersonal', personal: { visits }, baseVersion: 0 }, a)).json()).toEqual({ version: 1 });
    const conflict = await call(s, 'POST', { op: 'putPersonal', personal: { visits: [] }, baseVersion: 0 }, a);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ conflict: true, personal: { visits }, version: 1 });
    expect((await snapshot(s, b)).personal).toBeNull();
  });

  it('이상한 데이터는 거부', async () => {
    const s = memoryStore();
    const a = await signup(s, '나현');
    expect((await call(s, 'POST', { op: 'upsertRestaurant', restaurant: { id: 'x' } }, a)).status).toBe(400);
    expect((await call(s, 'POST', { op: 'nope' }, a)).status).toBe(400);
  });

  it('가입·로그인 시도가 너무 많으면 429', async () => {
    const s = memoryStore();
    for (let i = 0; i < 30; i++) await call(s, 'POST', { op: 'login', nick: 'x', password: 'zz' });
    expect((await call(s, 'POST', { op: 'login', nick: 'x', password: 'zzzz' })).status).toBe(429);
  });

  it('닉네임 검사', () => {
    expect(cleanNick(' 나현 ')).toBe('나현');
    expect(cleanNick('a|b')).toBeNull();
    expect(cleanNick('x'.repeat(21))).toBeNull();
  });

  it('비밀번호 해시', async () => {
    const h = await hashPassword('안산맛집');
    expect(h).not.toContain('안산맛집');
    expect(await checkPassword('안산맛집', h)).toBe(true);
    expect(await checkPassword('안산맛집!', h)).toBe(false);
  });
});

describe('upstashStore', () => {
  it('스냅숏은 pipeline 한 번, 별점 필드를 식당·사람별로 풀어줌', async () => {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith('/pipeline')) {
        expect(body.map((c: string[]) => c[0])).toEqual(['HGETALL', 'ZRANGE', 'HGETALL', 'GET', 'GET']);
        return new Response(JSON.stringify([
          { result: ['r1', JSON.stringify({ id: 'r1', name: 'x' })] },
          { result: ['학교 근처'] },
          { result: ['r1|나현', '5', 'r1|친구', '3'] },
          { result: JSON.stringify({ visits: [] }) },
          { result: '2' },
        ]));
      }
      return new Response(JSON.stringify({ result: body[0] === 'EVAL' ? [1, 3] : 1 }));
    });
    const store = upstashStore('https://redis.example.com/', 'TOKEN', f as unknown as typeof fetch);
    expect(await store.snapshot('나현')).toEqual({
      restaurants: [{ id: 'r1', name: 'x' }], areas: ['학교 근처'], stars: { r1: { 나현: 5, 친구: 3 } },
      personal: { visits: [] }, personalVersion: 2,
    });
    expect(await store.putPersonal('나현', 2, '{}')).toEqual({ ok: true, version: 3 });
    await store.setStars('r1', '나현', null);
    expect(JSON.parse((f.mock.calls.at(-1)![1] as RequestInit).body as string)).toEqual(['HDEL', 'ab:stars', 'r1|나현']);
  });
});
