/**
 * 공유 맛집 목록 저장소 (Vercel Function + Upstash Redis).
 * 목록·별점은 누구나 볼 수 있고, 식당 추가·수정·별점·먹은 기록 저장은 가입한 사람만.
 *
 *  - 식당: 하나씩 따로 저장 (Redis hash) → 여러 사람이 동시에 추가해도 덮어쓰지 않음
 *  - 지역: 추가된 순서대로 (sorted set)
 *  - 별점: 사람마다 따로 (`식당id|닉네임` → 1~5)
 *  - 먹은 기록: 사람마다 따로 (닉네임별 JSON, 버전 확인 후 저장)
 *  - 계정: 닉네임 → 비밀번호 해시(scrypt). 로그인하면 토큰(1년)을 받음
 *
 * GET  /api/data                       → 스냅숏 { restaurants, areas, stars, personal, personalVersion }
 *                                         (로그인 안 했으면 personal은 null)
 * POST /api/data { op: 'signup' | 'login', nick, password, legacyPasscode? } → { token, nick }
 * POST /api/data { op, ... }           → 변경 1건 (로그인 필요)
 * 헤더: authorization: Bearer <토큰>
 *
 * 환경 변수
 *  - KV_REST_API_URL / KV_REST_API_TOKEN (Vercel의 Upstash 연동이 자동으로 넣어줌)
 *  - APP_PASSCODE (선택): 예전 공유 비밀번호. 예전에 쓰던 닉네임으로 가입할 때 한 번 확인
 *  - ADMIN_NICKS (선택): 쉼표로 구분한 닉네임. 다른 사람이 추가한 식당도 지울 수 있음
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

export interface Snapshot {
  restaurants: Record<string, unknown>[];
  areas: string[];
  /** 식당 id → 닉네임 → 별점 */
  stars: Record<string, Record<string, number>>;
  personal: unknown | null;
  personalVersion: number;
}

export interface Store {
  /** nick이 없으면(로그인 안 함) 개인 기록은 빼고 */
  snapshot(nick: string | null): Promise<Snapshot>;
  getRestaurant(id: string): Promise<string | null>;
  upsertRestaurant(id: string, json: string): Promise<void>;
  deleteRestaurant(id: string): Promise<void>;
  addArea(area: string): Promise<void>;
  removeArea(area: string): Promise<void>;
  setStars(restaurantId: string, nick: string, stars: number | null): Promise<void>;
  /** expected 버전일 때만 저장. 아니면 ok:false */
  putPersonal(nick: string, expected: number, json: string): Promise<{ ok: boolean; version: number }>;
  getAccount(nick: string): Promise<string | null>;
  /** 이미 있으면 false */
  createAccount(nick: string, json: string): Promise<boolean>;
  /** 계정 없이 예전 공유 비밀번호로 쓰던 닉네임인지 (별점·먹은 기록이 남아 있음) */
  nickHasData(nick: string): Promise<boolean>;
  sessionNick(tokenHash: string): Promise<string | null>;
  createSession(tokenHash: string, nick: string): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  /** 횟수 세기 (windowSec 동안). 지금까지 횟수를 돌려줌 */
  hit(key: string, windowSec: number): Promise<number>;
}

const K = {
  restaurants: 'ab:restaurants',
  areas: 'ab:areas',
  stars: 'ab:stars',
  personal: (nick: string) => `ab:user:${nick}`,
  personalVersion: (nick: string) => `ab:userv:${nick}`,
  account: (nick: string) => `ab:acct:${nick}`,
  session: (hash: string) => `ab:sess:${hash}`,
  rate: (key: string) => `ab:rl:${key}`,
};
const SESSION_TTL = 60 * 60 * 24 * 365;

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
      const [r, a, s, p = { result: null }, pv = { result: null }] = (await call(
        [
          ['HGETALL', K.restaurants],
          ['ZRANGE', K.areas, '0', '-1'],
          ['HGETALL', K.stars],
          ...(nick ? [['GET', K.personal(nick)], ['GET', K.personalVersion(nick)]] : []),
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
    async getRestaurant(id) {
      return ((await cmd('HGET', K.restaurants, id)) as { result: string | null }).result;
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
    async getAccount(nick) {
      return ((await cmd('GET', K.account(nick))) as { result: string | null }).result;
    },
    async createAccount(nick, json) {
      return ((await cmd('SET', K.account(nick), json, 'NX')) as { result: string | null }).result === 'OK';
    },
    async nickHasData(nick) {
      const [v, keys] = (await call([['EXISTS', K.personalVersion(nick)], ['HKEYS', K.stars]], '/pipeline')) as { result: unknown }[];
      return Number(v.result) > 0 || ((keys.result as string[]) ?? []).some((k) => k.endsWith(`|${nick}`));
    },
    async sessionNick(hash) {
      return ((await cmd('GET', K.session(hash))) as { result: string | null }).result;
    },
    async createSession(hash, nick) {
      await cmd('SET', K.session(hash), nick, 'EX', SESSION_TTL);
    },
    async deleteSession(hash) {
      await cmd('DEL', K.session(hash));
    },
    async hit(key, windowSec) {
      const [n] = (await call([['INCR', K.rate(key)], ['EXPIRE', K.rate(key), String(windowSec), 'NX']], '/pipeline')) as { result: number }[];
      return Number(n.result);
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

const scrypt = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password.normalize('NFC'), salt, 32, (e, k) => (e ? reject(e) : resolve(k))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return JSON.stringify({ salt: salt.toString('hex'), hash: (await scrypt(password, salt)).toString('hex') });
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  try {
    const { salt, hash } = JSON.parse(stored) as { salt: string; hash: string };
    const got = await scrypt(password, Buffer.from(salt, 'hex'));
    const want = Buffer.from(hash, 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const clientIp = (request: Request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
const slow = () => new Promise((r) => setTimeout(r, 400)); // 비밀번호 마구 넣어보기 늦추기

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

/** 닉네임 검사 (앞뒤 공백 제거, 1~20자, | 와 줄바꿈 금지) */
export function cleanNick(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const nick = v.normalize('NFC').trim();
  return nick.length >= 1 && nick.length <= 20 && !/[|\n\r]/.test(nick) ? nick : null;
}

export interface DataEnv {
  /** 예전 공유 비밀번호 (예전 닉네임으로 가입할 때 확인) */
  passcode?: string;
  /** 다른 사람이 추가한 식당도 지울 수 있는 닉네임 */
  admins?: string[];
}

async function handleAuth(body: Record<string, unknown>, request: Request, env: DataEnv, store: Store): Promise<Response> {
  if ((await store.hit(`auth:${clientIp(request)}`, 3600)) > 30) {
    return json({ error: '시도가 너무 많아요. 한 시간 뒤에 다시 해주세요.' }, 429);
  }
  const nick = cleanNick(body.nick);
  if (!nick) return json({ error: '닉네임은 1~20자로 정해주세요.' }, 400);
  const password = body.password;
  if (typeof password !== 'string' || password.length < 4 || password.length > 72) {
    return json({ error: '비밀번호는 4자 이상으로 정해주세요.' }, 400);
  }

  if (body.op === 'signup') {
    if (await store.getAccount(nick)) return json({ error: '이미 있는 닉네임이에요. 로그인하거나 다른 닉네임을 써주세요.', code: 'taken' }, 409);
    // 예전 공유 비밀번호 시절에 쓰던 닉네임은 그 비밀번호를 아는 사람만 가져갈 수 있음
    if (env.passcode && (await store.nickHasData(nick))) {
      const given = typeof body.legacyPasscode === 'string' ? body.legacyPasscode : '';
      if (!given || !samePasscode(given, env.passcode)) {
        await slow();
        return json({ error: '예전에 쓰던 닉네임이에요. 예전 공유 비밀번호를 같이 입력해 주세요.', code: 'legacy' }, 403);
      }
    }
    if (!(await store.createAccount(nick, await hashPassword(password)))) return json({ error: '이미 있는 닉네임이에요.', code: 'taken' }, 409);
  } else {
    const stored = await store.getAccount(nick);
    if (!stored || !(await checkPassword(password, stored))) {
      await slow();
      return json({ error: '닉네임이나 비밀번호가 맞지 않아요.' }, 401);
    }
  }
  const token = randomBytes(32).toString('base64url');
  await store.createSession(tokenHash(token), nick);
  return json({ token, nick });
}

export async function handleData(request: Request, env: DataEnv, store: Store | null): Promise<Response> {
  if (!store) return json({ error: '서버 저장소가 설정되지 않았어요.', disabled: true }, 503);

  try {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const nick = token ? await store.sessionNick(tokenHash(token)) : null;
    if (token && !nick) return json({ error: '다시 로그인해 주세요.', code: 'session' }, 401);

    if (request.method === 'GET') return json({ ...(await store.snapshot(nick)), admin: !!nick && !!env.admins?.includes(nick) });
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

    if (body.op === 'signup' || body.op === 'login') return await handleAuth(body, request, env, store);
    if (!nick) return json({ error: '가입하거나 로그인해야 바꿀 수 있어요.', code: 'login' }, 401);

    switch (body.op) {
      case 'logout':
        await store.deleteSession(tokenHash(token));
        return json({ ok: true });
      case 'upsertRestaurant': {
        const r = cleanRestaurant(body.restaurant);
        if (!r) return bad();
        // 처음 추가한 사람은 서버에 있는 값을 그대로 (앱이 보낸 값은 믿지 않음)
        const prev = await store.getRestaurant(r.id as string);
        const addedBy = prev ? (JSON.parse(prev) as { addedBy?: string }).addedBy : nick;
        await store.upsertRestaurant(r.id as string, JSON.stringify({ ...r, updatedBy: nick, updatedAt: Date.now(), addedBy }));
        return json({ ok: true });
      }
      case 'deleteRestaurant': {
        if (!isStr(body.id, 64)) return bad();
        const prev = await store.getRestaurant(body.id as string);
        if (!prev) return json({ ok: true });
        const addedBy = (JSON.parse(prev) as { addedBy?: string }).addedBy;
        if (addedBy && addedBy !== nick && !env.admins?.includes(nick)) {
          return json({ error: '직접 추가한 식당만 지울 수 있어요.', code: 'forbidden' }, 403);
        }
        await store.deleteRestaurant(body.id as string);
        return json({ ok: true });
      }
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

export const envFrom = (env: Record<string, string | undefined>): DataEnv => ({
  passcode: env.APP_PASSCODE || undefined,
  admins: (env.ADMIN_NICKS ?? '').split(',').map((n) => n.normalize('NFC').trim()).filter(Boolean),
});

const handler = (request: Request) => handleData(request, envFrom(process.env), storeFromEnv(process.env));
export const GET = handler;
export const POST = handler;
