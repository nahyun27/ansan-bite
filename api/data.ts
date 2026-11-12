/**
 * 공유 맛집 목록 저장소 (Vercel Function + Upstash Redis).
 * 공유 비밀번호(APP_PASSCODE)를 아는 사람만 읽고 쓸 수 있다.
 *
 *  - 식당: 하나씩 따로 저장 (Redis hash) → 여러 사람이 동시에 추가해도 덮어쓰지 않음
 *  - 지역: 추가된 순서대로 (sorted set)
 *  - 별점: 사람마다 따로 (`식당id|닉네임` → 1~5)
 *  - 먹은 기록: 사람마다 따로 (닉네임별 JSON, 버전 확인 후 저장)
 *
 * GET  /api/data                       → 스냅숏 { restaurants, areas, stars, personal, personalVersion }
 * POST /api/data { op, ... }           → 변경 1건
 * 헤더: x-ansan-passcode, x-ansan-nick (닉네임, encodeURIComponent)
 *
 * 환경 변수: APP_PASSCODE, KV_REST_API_URL / KV_REST_API_TOKEN (Vercel의 Upstash 연동이 자동으로 넣어줌)
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export interface Snapshot {
  restaurants: Record<string, unknown>[];
  areas: string[];
  /** 식당 id → 닉네임 → 별점 */
  stars: Record<string, Record<string, number>>;
  personal: unknown | null;
  personalVersion: number;
}

export interface Store {
  snapshot(nick: string): Promise<Snapshot>;
  upsertRestaurant(id: string, json: string): Promise<void>;
  deleteRestaurant(id: string): Promise<void>;
  addArea(area: string): Promise<void>;
  removeArea(area: string): Promise<void>;
  setStars(restaurantId: string, nick: string, stars: number | null): Promise<void>;
  /** expected 버전일 때만 저장. 아니면 ok:false */
  putPersonal(nick: string, expected: number, json: string): Promise<{ ok: boolean; version: number }>;
}

const K = {
  restaurants: 'ab:restaurants',
  areas: 'ab:areas',
  stars: 'ab:stars',
  personal: (nick: string) => `ab:user:${nick}`,
  personalVersion: (nick: string) => `ab:userv:${nick}`,
};

const CAS_SCRIPT = `
local v = redis.call('GET', KEYS[2]) or '0'
if v ~= ARGV[1] then return {0, tonumber(v)} end
redis.call('SET', KEYS[1], ARGV[2])
local n = redis.call('INCR', KEYS[2])
return {1, n}`;

/** Redis HGETALL 결과(평평한 배열) → 객체 */
const pairs = (flat: string[] | null): [string, string][] => {
  const out: [string, string][] = [];
  for (let i = 0; flat && i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};

export function upstashStore(url: string, token: string, fetchImpl: typeof fetch = fetch): Store {
  const call = async (body: unknown, path = '') => {
    const res = await fetchImpl(url.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    return res.json();
  };
  const cmd = (...args: (string | number)[]) => call(args.map(String));

  return {
    async snapshot(nick) {
      const [r, a, s, p, pv] = (await call(
        [
          ['HGETALL', K.restaurants],
          ['ZRANGE', K.areas, '0', '-1'],
          ['HGETALL', K.stars],
          ['GET', K.personal(nick)],
          ['GET', K.personalVersion(nick)],
        ],
        '/pipeline',
      )) as { result: unknown }[];
      const stars: Snapshot['stars'] = {};
      for (const [field, value] of pairs(s.result as string[])) {
        const cut = field.lastIndexOf('|');
        const rid = field.slice(0, cut);
        (stars[rid] ??= {})[field.slice(cut + 1)] = Number(value);
      }
      return {
        restaurants: pairs(r.result as string[]).map(([, v]) => JSON.parse(v)),
        areas: (a.result as string[]) ?? [],
        stars,
        personal: p.result ? JSON.parse(p.result as string) : null,
        personalVersion: Number(pv.result ?? 0),
      };
    },
    async upsertRestaurant(id, json) {
      await cmd('HSET', K.restaurants, id, json);
    },
    async deleteRestaurant(id) {
      await cmd('HDEL', K.restaurants, id);
    },
    async addArea(area) {
      await cmd('ZADD', K.areas, 'NX', Date.now(), area);
    },
    async removeArea(area) {
      await cmd('ZREM', K.areas, area);
    },
    async setStars(rid, nick, stars) {
      if (stars) await cmd('HSET', K.stars, `${rid}|${nick}`, stars);
      else await cmd('HDEL', K.stars, `${rid}|${nick}`);
    },
    async putPersonal(nick, expected, json) {
      const { result } = (await call(['EVAL', CAS_SCRIPT, '2', K.personal(nick), K.personalVersion(nick), String(expected), json])) as {
        result: [number, number];
      };
      return { ok: result[0] === 1, version: Number(result[1]) };
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** 시간 차이로 비밀번호가 새지 않게 해시해서 비교 */
function samePasscode(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

const isStr = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isStrArray = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => typeof x === 'string' && x.length <= maxLen);

/** 공유 목록에 들어갈 식당인지 최소한으로 확인 (개인 정보인 별점은 따로 저장하므로 뺌) */
function cleanRestaurant(r: unknown): Record<string, unknown> | null {
  const x = r as Record<string, unknown> | null;
  if (!x || !isStr(x.id, 64) || !isStr(x.name, 100) || !isStr(x.area, 50) || !isStr(x.category, 30)) return null;
  if (!isStrArray(x.menus, 30, 50) || !isStrArray(x.goodFor, 5, 10) || !isStrArray(x.tags, 40, 30)) return null;
  const { stars: _personal, ...rest } = x;
  void _personal;
  return JSON.stringify(rest).length <= 20_000 ? rest : null;
}

export function readNick(header: string | null): string | null {
  if (!header) return null;
  let nick: string;
  try {
    nick = decodeURIComponent(header).trim();
  } catch {
    return null;
  }
  return nick.length >= 1 && nick.length <= 20 && !/[|\n\r]/.test(nick) ? nick : null;
}

export async function handleData(request: Request, passcode: string | undefined, store: Store | null): Promise<Response> {
  if (!passcode || !store) return json({ error: '서버 저장소가 설정되지 않았어요.', disabled: true }, 503);

  let given = request.headers.get('x-ansan-passcode') ?? '';
  try {
    given = decodeURIComponent(given); // 한글 비밀번호도 쓸 수 있게 앱이 인코딩해서 보냄
  } catch {
    /* 그대로 비교 */
  }
  if (!samePasscode(given, passcode)) {
    await new Promise((r) => setTimeout(r, 400)); // 비밀번호 마구 넣어보기 늦추기
    return json({ error: '비밀번호가 맞지 않아요.' }, 401);
  }
  const nick = readNick(request.headers.get('x-ansan-nick'));
  if (!nick) return json({ error: '닉네임을 정해주세요. (1~20자)' }, 400);

  try {
    if (request.method === 'GET') return json(await store.snapshot(nick));
    if (request.method !== 'POST') return json({ error: '지원하지 않는 요청이에요.' }, 405);

    const text = await request.text();
    if (text.length > 900_000) return json({ error: '데이터가 너무 커요.' }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: '형식이 잘못됐어요.' }, 400);
    }
    const bad = () => json({ error: '형식이 잘못됐어요.' }, 400);

    switch (body.op) {
      case 'upsertRestaurant': {
        const r = cleanRestaurant(body.restaurant);
        if (!r) return bad();
        await store.upsertRestaurant(r.id as string, JSON.stringify({ ...r, updatedBy: nick, updatedAt: Date.now(), addedBy: r.addedBy ?? nick }));
        return json({ ok: true });
      }
      case 'deleteRestaurant':
        if (!isStr(body.id, 64)) return bad();
        await store.deleteRestaurant(body.id as string);
        return json({ ok: true });
      case 'addArea':
      case 'removeArea':
        if (!isStr(body.area, 50)) return bad();
        await (body.op === 'addArea' ? store.addArea((body.area as string).trim()) : store.removeArea(body.area as string));
        return json({ ok: true });
      case 'setStars': {
        const s = body.stars;
        if (!isStr(body.restaurantId, 64) || !(s === null || (Number.isInteger(s) && (s as number) >= 1 && (s as number) <= 5))) return bad();
        await store.setStars(body.restaurantId as string, nick, s as number | null);
        return json({ ok: true });
      }
      case 'putPersonal': {
        const p = body.personal as Record<string, unknown> | null;
        if (!p || !Array.isArray(p.visits) || typeof body.baseVersion !== 'number') return bad();
        const result = await store.putPersonal(nick, body.baseVersion, JSON.stringify({ visits: p.visits }));
        if (result.ok) return json({ version: result.version });
        const snap = await store.snapshot(nick);
        return json({ conflict: true, personal: snap.personal, version: snap.personalVersion }, 409);
      }
      default:
        return bad();
    }
  } catch {
    return json({ error: '저장소에 연결하지 못했어요.' }, 502);
  }
}

export function storeFromEnv(env: Record<string, string | undefined>): Store | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstashStore(url, token) : null;
}

const handler = (request: Request) => handleData(request, process.env.APP_PASSCODE, storeFromEnv(process.env));
export const GET = handler;
export const POST = handler;
