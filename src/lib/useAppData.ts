import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, AreaCenter, Restaurant } from '../types';
import { createInitialData } from '../data/defaults';
import { loadData, saveData } from './storage';
import { newId, toDateStr } from './utils';
import {
  applyOps,
  fetchSnapshot,
  initialUploadOps,
  loadMeta,
  loadOutbox,
  loadSession,
  mergeSnapshot,
  mergeVisits,
  putPersonal,
  saveMeta,
  saveOutbox,
  saveSession,
  sendOp,
  sharedPart,
  type Op,
  type Result,
  type Session,
  type SyncMeta,
} from './remote';

export type Actions = ReturnType<typeof useAppData>['actions'];
export type Sync = ReturnType<typeof useAppData>['sync'];

/**
 * - checking: 서버 확인 중 (그동안은 이 기기 사본으로 동작)
 * - local: 서버 저장소가 없음 → 이 기기에만 저장
 * - login: 공유 비밀번호·닉네임 필요
 * - syncing / synced / offline / error: 공유 모드
 */
export type SyncStatus = 'checking' | 'local' | 'login' | 'syncing' | 'synced' | 'offline' | 'error';

const EMPTY_SNAPSHOT = { restaurants: [], areas: [], stars: {}, personal: null, personalVersion: 0 };

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);
  const dataRef = useRef(data);
  dataRef.current = data;

  const [session, setSession] = useState<Session | null>(loadSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [status, setStatus] = useState<SyncStatus>('checking');
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(() => loadOutbox().length);

  /** 아직 서버에 못 보낸 변경 (이 기기에 저장돼서 앱을 껐다 켜도 남음) */
  const outbox = useRef<Op[]>(loadOutbox());
  const meta = useRef<SyncMeta>(loadMeta());
  /** 서버와 연결된 공유 모드인지 (오프라인이어도 로그인돼 있으면 true) */
  const shared = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);

  useEffect(() => saveData(data), [data]);

  const persistOutbox = () => {
    saveOutbox(outbox.current);
    setPendingCount(outbox.current.length);
  };
  const persistMeta = () => saveMeta(meta.current);

  /** 실패 결과를 상태로 */
  const fail = (r: Exclude<Result<unknown>, { kind: 'ok' } | { kind: 'conflict' }>) => {
    if (r.kind === 'disabled') {
      shared.current = false;
      setStatus('local');
    } else if (r.kind === 'unauthorized') {
      setError(r.message);
      setStatus('login');
    } else if (r.kind === 'offline') {
      setStatus('offline');
    } else {
      setError(r.message);
      setStatus('error');
    }
  };

  /** 못 보낸 변경과 먹은 기록을 서버로 */
  const flush = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !shared.current) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setStatus('syncing');
    try {
      while (outbox.current.length) {
        const r = await sendOp(s, outbox.current[0]);
        if (r.kind === 'error') {
          // 서버가 거부한 변경(형식 오류 등)은 뒤의 변경까지 막히지 않게 버림
          outbox.current.shift();
          persistOutbox();
          setError(r.message);
          continue;
        }
        if (r.kind !== 'ok') return r.kind === 'conflict' ? undefined : fail(r);
        outbox.current.shift();
        persistOutbox();
      }

      // 먹은 기록 (사람마다 따로, 버전 확인 후 저장)
      for (let attempt = 0; attempt < 3; attempt++) {
        const visits = dataRef.current.visits;
        const json = JSON.stringify(visits);
        if (json === meta.current.personalSynced) break;
        const r = await putPersonal(s, visits, meta.current.personalVersion);
        if (r.kind === 'ok') {
          meta.current = { ...meta.current, personalVersion: r.value.version, personalSynced: json };
          persistMeta();
          break;
        }
        if (r.kind === 'conflict') {
          // 다른 기기에서 먼저 바뀜 → 합쳐서 다시
          const remote = r.value.personal?.visits ?? [];
          meta.current = { ...meta.current, personalVersion: r.value.version, personalSynced: JSON.stringify(remote) };
          const merged = mergeVisits(visits, remote);
          dataRef.current = { ...dataRef.current, visits: merged };
          setData((d) => ({ ...d, visits: mergeVisits(d.visits, remote) }));
          continue;
        }
        return fail(r);
      }
      setError('');
      setStatus('synced');
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, []);

  /** 서버에서 최신 공유 목록·내 기록 받아오기 */
  const pull = useCallback(async () => {
    const s = sessionRef.current;
    const r = await fetchSnapshot(s);
    if (r.kind !== 'ok') {
      if (r.kind === 'offline' && !s) return setStatus('local'); // 로그인 전 + 오프라인: 일단 이 기기로
      if (r.kind === 'offline' && s) shared.current = true; // 로그인돼 있으면 쌓아뒀다가 나중에 보냄
      if (r.kind === 'conflict') return;
      return fail(r);
    }
    if (!s) return setStatus('login');
    const snap = r.value;
    shared.current = true;

    // 이 기기에서 처음 로그인: 서버에 없는 식당·지역·별점을 올림
    if (!meta.current.initialized) {
      outbox.current.push(...initialUploadOps(dataRef.current, snap, s.nick));
      meta.current = { ...meta.current, initialized: true };
      persistOutbox();
    }

    const local = dataRef.current;
    const remoteVisits = (snap.personal as { visits?: AppData['visits'] } | null)?.visits ?? [];
    const localJson = JSON.stringify(local.visits);
    // 이 기기에서 바뀐 게 없으면 서버 기록 그대로, 있으면 합침 (합친 건 flush에서 올라감)
    const dirty = meta.current.personalSynced === undefined || localJson !== meta.current.personalSynced;
    const visits = dirty ? mergeVisits(local.visits, remoteVisits) : remoteVisits;
    meta.current = { ...meta.current, personalVersion: snap.personalVersion, personalSynced: JSON.stringify(remoteVisits) };
    persistMeta();

    const next = { ...mergeSnapshot(local, snap, s.nick, outbox.current), visits };
    dataRef.current = next;
    setData(next);
    await flush();
  }, [flush]);

  // 시작할 때, 앱으로 돌아올 때, 인터넷이 다시 연결될 때
  useEffect(() => {
    void pull();
    const onVisible = () => document.visibilityState === 'visible' && sessionRef.current && void pull();
    const onOnline = () => sessionRef.current && void pull();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [pull]);

  // 먹은 기록이 바뀌면 잠깐 모았다가 저장
  useEffect(() => {
    if (!shared.current) return;
    const t = window.setTimeout(() => void flush(), 800);
    return () => window.clearTimeout(t);
  }, [data.visits, flush]);

  /** 공유 부분 변경: 이 기기에 바로 반영 + 서버로 보낼 목록에 추가 */
  const apply = useCallback(
    (ops: Op[], extra?: (d: AppData) => AppData) => {
      const nick = sessionRef.current?.nick ?? 'me';
      setData((d) => {
        const n = applyOps(d, ops, nick);
        return extra ? extra(n) : n;
      });
      if (shared.current && ops.length) {
        outbox.current.push(...ops);
        persistOutbox();
        void flush();
      }
    },
    [flush],
  );

  // ---- 동작 ----

  const addVisit = useCallback((restaurantId: string): string => {
    const id = newId();
    setData((d) => ({ ...d, visits: [...d.visits, { id, restaurantId, date: toDateStr() }] }));
    return id;
  }, []);

  /** 그날 별점 남기기 → 방문 기록에 남기고, 내 별점도 이 값으로 */
  const rateVisit = useCallback(
    (visitId: string, stars: number | undefined) => {
      const visit = dataRef.current.visits.find((v) => v.id === visitId);
      if (!visit) return;
      apply(stars ? [{ op: 'setStars', restaurantId: visit.restaurantId, stars }] : [], (d) => ({
        ...d,
        visits: d.visits.map((v) => (v.id === visitId ? { ...v, stars, ratingSkipped: undefined } : v)),
      }));
    },
    [apply],
  );

  const skipRating = useCallback((visitId: string) => {
    setData((d) => ({ ...d, visits: d.visits.map((v) => (v.id === visitId ? { ...v, ratingSkipped: true } : v)) }));
  }, []);

  const deleteVisit = useCallback((visitId: string) => {
    setData((d) => ({ ...d, visits: d.visits.filter((v) => v.id !== visitId) }));
  }, []);

  const restaurantOps = (r: Restaurant, prev: Restaurant | undefined, areas: string[]): Op[] => {
    const ops: Op[] = [];
    if (!areas.includes(r.area)) ops.push({ op: 'addArea', area: r.area });
    ops.push({ op: 'upsertRestaurant', restaurant: sharedPart(r) });
    if ((prev?.stars ?? undefined) !== r.stars) ops.push({ op: 'setStars', restaurantId: r.id, stars: r.stars ?? null });
    return ops;
  };

  const saveRestaurant = useCallback(
    (r: Restaurant) => {
      const d = dataRef.current;
      const prev = d.restaurants.find((x) => x.id === r.id);
      const withAuthor = prev ? r : { ...r, addedBy: r.addedBy ?? sessionRef.current?.nick };
      apply(restaurantOps(withAuthor, prev, d.areas));
    },
    [apply],
  );

  const addRestaurants = useCallback(
    (list: Restaurant[]) => {
      const areas = [...dataRef.current.areas];
      const ops = list.flatMap((r) => {
        const o = restaurantOps({ ...r, addedBy: sessionRef.current?.nick }, undefined, areas);
        if (!areas.includes(r.area)) areas.push(r.area);
        return o;
      });
      apply(ops);
    },
    [apply],
  );

  const setAreaCenter = useCallback((area: string, center: AreaCenter) => {
    setData((d) => ({ ...d, areaCenters: { ...d.areaCenters, [area]: center } }));
  }, []);

  const deleteRestaurant = useCallback(
    (id: string) => {
      apply([{ op: 'deleteRestaurant', id }], (d) => ({ ...d, visits: d.visits.filter((v) => v.restaurantId !== id) }));
    },
    [apply],
  );

  const addArea = useCallback(
    (area: string) => {
      const a = area.trim();
      if (!a || dataRef.current.areas.includes(a)) return;
      apply([{ op: 'addArea', area: a }]);
    },
    [apply],
  );

  const removeArea = useCallback(
    (area: string) => {
      if (dataRef.current.restaurants.some((r) => r.area === area)) return;
      apply([{ op: 'removeArea', area }]);
    },
    [apply],
  );

  /** 백업 불러오기: 이 기기 데이터를 바꾸고, 공유 모드면 식당·별점을 공유 목록에 올림 (지우지는 않음) */
  const replaceData = useCallback(
    (next: AppData) => {
      setData(next);
      if (shared.current && sessionRef.current) {
        outbox.current.push(...initialUploadOps(next, EMPTY_SNAPSHOT, sessionRef.current.nick));
        persistOutbox();
        void flush();
      }
    },
    [flush],
  );

  /** 이 기기에서만 쓸 때(공유 모드 아님) 전부 지우기 */
  const resetAll = useCallback(() => setData(createInitialData()), []);

  // ---- 로그인 ----

  /** 공유 비밀번호·닉네임 확인 후 저장. 실패하면 이유를 돌려줌 */
  const login = useCallback(
    async (passcode: string, nick: string): Promise<string | null> => {
      const s = { passcode, nick: nick.trim() };
      const r = await fetchSnapshot(s);
      if (r.kind === 'unauthorized') return r.message || '비밀번호가 맞지 않아요.';
      if (r.kind === 'offline') return '인터넷 연결을 확인해 주세요.';
      if (r.kind === 'error') return r.message;
      if (r.kind === 'disabled') return '서버 저장소가 아직 설정되지 않았어요.';
      // 닉네임마다 먹은 기록이 따로라 동기화 정보는 새로 시작
      meta.current = { personalVersion: 0, initialized: false };
      persistMeta();
      saveSession(s);
      sessionRef.current = s;
      setSession(s);
      setError('');
      await pull();
      return null;
    },
    [pull],
  );

  /** 이 기기에서 나가기 (이 기기의 사본은 남음) */
  const logout = useCallback(() => {
    saveSession(null);
    sessionRef.current = null;
    setSession(null);
    shared.current = false;
    outbox.current = [];
    persistOutbox();
    meta.current = { personalVersion: 0, initialized: false };
    saveMeta(null);
    setStatus('login');
  }, []);

  const retry = useCallback(() => void pull(), [pull]);

  return {
    data,
    actions: {
      addVisit, rateVisit, skipRating, deleteVisit,
      saveRestaurant, addRestaurants, deleteRestaurant,
      addArea, removeArea, setAreaCenter,
      replaceData, resetAll,
    },
    sync: { status, error, nick: session?.nick, pendingCount, login, logout, retry },
  };
}
