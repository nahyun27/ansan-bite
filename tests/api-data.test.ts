import { describe, expect, it, vi } from 'vitest';
import { handleData, readNick, upstashStore, type Snapshot, type Store } from '../api/data';

/** 테스트용 메모리 저장소 */
function memoryStore() {
  const restaurants = new Map<string, string>();
  const areas: string[] = [];
  const stars = new Map<string, number>();
  const personal = new Map<string, { json: string; v: number }>();
  const store: Store = {
    async snapshot(nick) {
      const s: Snapshot['stars'] = {};
      for (const [k, v] of stars) {
        const [rid, n] = k.split('|');
        (s[rid] ??= {})[n] = v;
      }
      const p = personal.get(nick);
      return {
        restaurants: [...restaurants.values()].map((j) => JSON.parse(j)),
        areas: [...areas],
        stars: s,
        personal: p ? JSON.parse(p.json) : null,
        personalVersion: p?.v ?? 0,
      };
    },
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
  };
  return store;
}

const PW = 'secret-pass';
const req = (method: string, body?: unknown, { pw = PW, nick = '나현' }: { pw?: string; nick?: string | null } = {}) =>
  new Request('http://x/api/data', {
    method,
    headers: { 'x-ansan-passcode': encodeURIComponent(pw), ...(nick ? { 'x-ansan-nick': encodeURIComponent(nick) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const restaurant = { id: 'r1', name: '마라공방', area: '학교 근처', category: '중식', menus: ['마라탕'], goodFor: ['혼밥'], tags: [], stars: 5 };

describe('handleData', () => {
  it('설정이 없으면 503 (앱은 로컬 저장으로 동작)', async () => {
    const res = await handleData(req('GET'), undefined, memoryStore());
    expect(res.status).toBe(503);
    expect((await res.json()).disabled).toBe(true);
  });

  it('비밀번호가 틀리면 401, 닉네임이 없으면 400', async () => {
    expect((await handleData(req('GET', undefined, { pw: 'wrong' }), PW, memoryStore())).status).toBe(401);
    expect((await handleData(req('GET', undefined, { nick: null }), PW, memoryStore())).status).toBe(400);
  });

  it('식당 추가: 별점(개인)은 빼고 저장, 누가 추가했는지 기록', async () => {
    const s = memoryStore();
    expect((await handleData(req('POST', { op: 'upsertRestaurant', restaurant }), PW, s)).status).toBe(200);
    const snap = (await (await handleData(req('GET'), PW, s)).json()) as Snapshot;
    expect(snap.restaurants).toHaveLength(1);
    expect(snap.restaurants[0]).toMatchObject({ id: 'r1', name: '마라공방', addedBy: '나현', updatedBy: '나현' });
    expect(snap.restaurants[0]).not.toHaveProperty('stars');
  });

  it('두 사람이 각자 추가해도 둘 다 남음', async () => {
    const s = memoryStore();
    await handleData(req('POST', { op: 'upsertRestaurant', restaurant }), PW, s);
    await handleData(req('POST', { op: 'upsertRestaurant', restaurant: { ...restaurant, id: 'r2', name: '든든국밥' } }, { nick: '친구' }), PW, s);
    const snap = (await (await handleData(req('GET'), PW, s)).json()) as Snapshot;
    expect(snap.restaurants.map((r) => r.name).sort()).toEqual(['든든국밥', '마라공방']);
    expect(snap.restaurants.find((r) => r.id === 'r2')?.addedBy).toBe('친구');
  });

  it('별점은 사람마다 따로', async () => {
    const s = memoryStore();
    await handleData(req('POST', { op: 'setStars', restaurantId: 'r1', stars: 5 }), PW, s);
    await handleData(req('POST', { op: 'setStars', restaurantId: 'r1', stars: 3 }, { nick: '친구' }), PW, s);
    const snap = (await (await handleData(req('GET'), PW, s)).json()) as Snapshot;
    expect(snap.stars).toEqual({ r1: { 나현: 5, 친구: 3 } });
    expect((await handleData(req('POST', { op: 'setStars', restaurantId: 'r1', stars: 9 }), PW, s)).status).toBe(400);
  });

  it('먹은 기록은 사람마다 따로 + 버전이 다르면 409', async () => {
    const s = memoryStore();
    const visits = [{ id: 'v1', restaurantId: 'r1', date: '2026-11-13' }];
    expect(await (await handleData(req('POST', { op: 'putPersonal', personal: { visits }, baseVersion: 0 }), PW, s)).json()).toEqual({ version: 1 });
    const conflict = await handleData(req('POST', { op: 'putPersonal', personal: { visits: [] }, baseVersion: 0 }), PW, s);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ conflict: true, personal: { visits }, version: 1 });
    const friend = (await (await handleData(req('GET', undefined, { nick: '친구' }), PW, s)).json()) as Snapshot;
    expect(friend.personal).toBeNull();
  });

  it('이상한 데이터는 거부', async () => {
    const s = memoryStore();
    expect((await handleData(req('POST', { op: 'upsertRestaurant', restaurant: { id: 'x' } }), PW, s)).status).toBe(400);
    expect((await handleData(req('POST', { op: 'nope' }), PW, s)).status).toBe(400);
  });

  it('한글 비밀번호', async () => {
    expect((await handleData(req('GET', undefined, { pw: '안산맛집' }), '안산맛집', memoryStore())).status).toBe(200);
  });

  it('닉네임 검사', () => {
    expect(readNick(encodeURIComponent(' 나현 '))).toBe('나현');
    expect(readNick(encodeURIComponent('a|b'))).toBeNull();
    expect(readNick(encodeURIComponent('x'.repeat(21)))).toBeNull();
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
