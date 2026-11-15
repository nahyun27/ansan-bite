import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Loader, MapPin, X } from 'lucide-react';
import type { Restaurant } from '../types';
import type { Actions } from '../lib/useAppData';
import { geocodeKakao, geocodeRestaurant, needsLookup } from '../lib/geocode';
import { KAKAO_JS_KEY, loadKakao, type KakaoNS } from '../lib/kakaoSdk';
import { kakaoAdapter, leafletAdapter, type MapAdapter } from '../lib/mapAdapter';

interface Props {
  /** 필터가 적용된 식당 목록 */
  restaurants: Restaurant[];
  actions: Actions;
  onEdit: (r: Restaurant) => void;
  /** 지금 화면에 보이는지 (숨겨진 탭이면 위치 찾기를 멈춤) */
  active: boolean;
}

export function RestaurantMap({ restaurants, actions, onEdit, active }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapAdapter | null>(null);
  const kakaoRef = useRef<KakaoNS | null>(null);
  const [engine, setEngine] = useState<'loading' | 'kakao' | 'osm'>(KAKAO_JS_KEY ? 'loading' : 'osm');
  const [mapError, setMapError] = useState('');
  const fitted = useRef(false);
  const [picking, setPicking] = useState<Restaurant | null>(null);
  const pickingRef = useRef<Restaurant | null>(null);
  pickingRef.current = picking;
  // actions·onEdit은 화면을 그릴 때마다 새로 만들어지므로 최신 값만 담아두고 지도는 한 번만 만든다
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const placed = useMemo(() => restaurants.filter((r) => r.coords), [restaurants]);
  const missing = useMemo(() => restaurants.filter((r) => !r.coords), [restaurants]);
  const approx = useMemo(() => restaurants.filter((r) => r.coords && r.coordsSource === 'approx'), [restaurants]);

  // 카카오 키가 있으면 카카오 지도, 불러오기 실패하면 무료 지도로
  useEffect(() => {
    if (engine !== 'loading') return;
    loadKakao()
      .then((k) => {
        kakaoRef.current = k;
        setEngine('kakao');
      })
      .catch((e: Error) => {
        setMapError(e.message);
        setEngine('osm');
      });
  }, [engine]);

  // 지도 만들기 (엔진이 정해지면 한 번)
  useEffect(() => {
    if (!box.current || engine === 'loading') return;
    const a = engine === 'kakao' && kakaoRef.current ? kakaoAdapter(box.current, kakaoRef.current) : leafletAdapter(box.current);
    a.onClick((p) => {
      const r = pickingRef.current;
      if (!r) return;
      actionsRef.current.setLocation(r.id, p, 'manual');
      setPicking(null);
    });
    adapter.current = a;
    fitted.current = false;
    const ro = new ResizeObserver(() => a.relayout());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      a.destroy();
      adapter.current = null;
    };
  }, [engine]);

  // 핀 다시 그리기
  useEffect(() => {
    const a = adapter.current;
    if (!a) return;
    a.setPins(placed, { onEdit: (r) => onEditRef.current(r), onMove: (r) => setPicking(r) });
    if (!fitted.current && placed.length) {
      a.fit(placed);
      fitted.current = true;
    }
  }, [placed, engine]);

  // 위치 자동 찾기: 최신 목록을 보면서 이번에 시도한 식당은 건너뜀
  const latest = useRef(restaurants);
  latest.current = restaurants;
  const tried = useRef(new Set<string>());
  const useKakao = engine === 'kakao';
  const pendingCount = restaurants.filter((r) => needsLookup(r, useKakao) && !tried.current.has(r.id)).length;
  useEffect(() => {
    if (!active || engine === 'loading' || pendingCount === 0) return;
    let cancelled = false;
    (async () => {
      let done = 0;
      for (;;) {
        const pending = latest.current.filter((r) => needsLookup(r, useKakao) && !tried.current.has(r.id));
        const next = pending[0];
        if (!next || cancelled) break;
        setProgress({ done, total: done + pending.length });
        tried.current.add(next.id);
        try {
          if (useKakao && kakaoRef.current) {
            const found = await geocodeKakao(kakaoRef.current, next);
            if (found) actionsRef.current.setLocation(next.id, found.coords, 'kakao', { kakaoId: found.kakaoId, kakaoUrl: found.kakaoUrl, kakaoTried: true });
            // 카카오로도 못 찾으면: 무료 지도로 찾은 대략 위치는 남겨두고 다시 찾지 않게만 표시
            else actionsRef.current.setLocation(next.id, next.coords, next.coords ? 'approx' : 'notfound', { kakaoTried: true });
          } else {
            const found = await geocodeRestaurant(next);
            actionsRef.current.setLocation(next.id, found?.coords, found ? found.source : 'none');
          }
        } catch {
          tried.current.delete(next.id); // 네트워크 오류: 다음에 지도를 열 때 다시
          break;
        }
        done += 1;
      }
      setProgress(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, engine, useKakao, pendingCount > 0]);

  const fixList = [...missing, ...approx];

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-2xl bg-stone-100 shadow-sm ${picking ? 'ab-picking' : ''}`}>
        {/* 지도 라이브러리가 이 칸을 직접 다루므로 React가 className을 바꾸지 않게 고정 */}
        <div ref={box} className="h-[58vh] min-h-80 w-full" />
        {engine === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-500">
            <Loader className="mr-1.5 size-4 animate-spin" /> 지도 불러오는 중
          </div>
        )}
        {picking && (
          <div className="absolute inset-x-3 top-3 z-[1000] flex items-center gap-2 rounded-xl bg-stone-900/90 px-3 py-2 text-sm text-white">
            <Crosshair className="size-4 shrink-0" />
            <span className="flex-1"><b>{picking.name}</b> 위치를 지도에서 눌러주세요</span>
            <button onClick={() => setPicking(null)} aria-label="위치 지정 취소" className="rounded-full p-1"><X className="size-4" /></button>
          </div>
        )}
        {progress && !picking && (
          <div className="absolute inset-x-3 bottom-3 z-[1000] flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs text-stone-600 shadow">
            <Loader className="size-3.5 animate-spin" /> {useKakao ? '카카오로' : '주소로'} 위치 찾는 중 {progress.done}/{progress.total}
          </div>
        )}
      </div>
      {mapError && KAKAO_JS_KEY && (
        <p className="text-xs text-amber-700">{mapError} 지금은 무료 지도로 보여드려요.</p>
      )}

      {fixList.length > 0 && (
        <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">위치 확인이 필요한 곳 <span className="font-normal text-stone-400">{fixList.length}</span></h3>
          <p className="text-xs text-stone-500">[위치 지정]을 누르고 지도에서 식당 자리를 콕 찍어주세요. 같이 쓰는 사람들에게도 저장돼요.</p>
          <ul className="divide-y divide-stone-100">
            {fixList.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
                <MapPin className={`size-4 shrink-0 ${r.coords ? 'text-amber-500' : 'text-stone-300'}`} />
                <span className="min-w-0 flex-1 truncate">
                  {r.name}{' '}
                  <span className="text-xs text-stone-400">
                    {r.coords ? '대략 위치' : r.coordsSource === 'none' || r.coordsSource === 'notfound' ? '못 찾음' : '찾는 중'}
                  </span>
                </span>
                <button
                  onClick={() => {
                    setPicking(r);
                    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="shrink-0 rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700"
                >
                  위치 지정
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
