import { useEffect, useState } from 'react';
import { Check, ChevronLeft, MapPin, X } from 'lucide-react';
import type { AppData, AreaCenter, Restaurant } from '../types';
import { DEFAULT_CENTER_QUERY } from '../data/defaults';
import { findCenter, isAlreadySaved, parseCategory, placeToRestaurant, searchPlaces, type PlaceResult } from '../lib/places';
import { distanceMeters, formatDistance, newId } from '../lib/utils';
import { Chip, ChipGroup } from './ChipGroup';

interface Props {
  data: AppData;
  initialArea: string;
  onSetCenter: (area: string, center: AreaCenter) => void;
  onAdd: (list: Restaurant[]) => void;
  onClose: () => void;
}

/** 고른 시점의 지역·기준 위치를 함께 기억 (지역을 바꿔가며 골라도 각자 맞는 지역으로 저장) */
interface Picked {
  place: PlaceResult;
  area: string;
  center?: AreaCenter;
}

const RADII = [500, 1000, 1500, 3000] as const;
const input = 'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base outline-none focus:border-orange-400';

export function KakaoImport({ data, initialArea, onSetCenter, onAdd, onClose }: Props) {
  const [area, setArea] = useState(initialArea);
  const [radius, setRadius] = useState<number>(1000);
  const [query, setQuery] = useState('');
  const [centerQuery, setCenterQuery] = useState('');
  const [editingCenter, setEditingCenter] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [page, setPage] = useState(1);
  const [isEnd, setIsEnd] = useState(true);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Map<string, Picked>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const center = data.areaCenters?.[area];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // 지역의 기준 위치가 없으면 기본 검색어로 한 번 찾아둔다
  useEffect(() => {
    if (center) return;
    let cancelled = false;
    findCenter(DEFAULT_CENTER_QUERY[area] ?? `안산 ${area}`)
      .then((c) => {
        if (cancelled) return;
        if (c) onSetCenter(area, c);
        else setEditingCenter(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [area, center, onSetCenter]);

  const changeArea = (a: string) => {
    setArea(a);
    setResults([]);
    setSearched(false);
    setEditingCenter(false);
    setError('');
  };

  const saveCenter = async () => {
    if (!centerQuery.trim()) return;
    setError('');
    try {
      const c = await findCenter(centerQuery.trim());
      if (!c) return setError('그 이름으로는 위치를 못 찾았어요.');
      onSetCenter(area, c);
      setEditingCenter(false);
      setCenterQuery('');
      setResults([]);
      setSearched(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const search = async (nextPage = 1) => {
    if (!center) return setError('기준 위치를 먼저 정해주세요.');
    setLoading(true);
    setError('');
    try {
      const res = await searchPlaces({ query: query.trim(), category: 'FD6', center, radius, page: nextPage });
      setResults((prev) => (nextPage === 1 ? res.places : [...prev, ...res.places.filter((p) => !prev.some((q) => q.id === p.id))]));
      setPage(nextPage);
      setIsEnd(res.isEnd);
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (p: PlaceResult) =>
    setSelected((m) => {
      const next = new Map(m);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, { place: p, area, center });
      return next;
    });

  const add = () => {
    onAdd([...selected.values()].map((x) => placeToRestaurant(x.place, x.area, x.center, newId())));
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-orange-50">
      <div className="mx-auto max-w-md space-y-4 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-36">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="flex items-center text-sm text-stone-500"><ChevronLeft className="size-4" /> 닫기</button>
          <h2 className="text-lg font-bold">카카오맵에서 가져오기</h2>
          <span className="w-12" />
        </div>

        <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          <ChipGroup label="어느 지역에 저장할까?" options={data.areas} value={area} onChange={changeArea} />

          <div>
            <div className="mb-1.5 text-sm font-semibold text-stone-500">기준 위치</div>
            {editingCenter || !center ? (
              <div className="flex gap-2">
                <input className={input} value={centerQuery} onChange={(e) => setCenterQuery(e.target.value)}
                  placeholder={center ? center.label : '예: 한양대학교 ERICA캠퍼스'}
                  onKeyDown={(e) => e.key === 'Enter' && saveCenter()} />
                <button onClick={saveCenter} className="shrink-0 rounded-xl bg-stone-200 px-3 text-sm font-medium">찾기</button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-1"><MapPin className="size-4 text-orange-500" /> {center.label}</span>
                <button onClick={() => setEditingCenter(true)} className="text-xs text-orange-600 underline">바꾸기</button>
              </div>
            )}
          </div>

          <ChipGroup<number>
            label="반경"
            options={RADII}
            value={radius}
            onChange={setRadius}
            render={(r) => formatDistance(r)}
          />

          <div className="flex gap-2">
            <input className={input} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="검색어 (비우면 주변 음식점 전체)" onKeyDown={(e) => e.key === 'Enter' && search(1)} />
            <button onClick={() => search(1)} disabled={loading || !center}
              className="shrink-0 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">
              검색
            </button>
          </div>
          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
        </section>

        {searched && (
          <section>
            {results.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400">검색 결과가 없어요. 반경을 넓혀보세요.</p>
            ) : (
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
                {results.map((p) => {
                  const saved = isAlreadySaved(p, data.restaurants);
                  const checked = selected.has(p.id);
                  const { category, detail } = parseCategory(p.categoryName);
                  const meters = center ? distanceMeters(center, p) : p.distance;
                  return (
                    <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${saved ? 'opacity-50' : ''}`}>
                      <button
                        disabled={saved}
                        onClick={() => toggle(p)}
                        aria-label={`${p.name} 선택`}
                        className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
                          checked ? 'border-orange-500 bg-orange-500 text-white' : 'border-stone-300 bg-white'
                        }`}
                      >
                        {checked && <Check className="size-4" strokeWidth={3} />}
                      </button>
                      <button disabled={saved} onClick={() => toggle(p)} className="min-w-0 flex-1 text-left">
                        <div className="truncate font-semibold">
                          {p.name} {saved && <span className="text-xs font-normal text-stone-500">· 이미 있음</span>}
                        </div>
                        <div className="truncate text-xs text-stone-500">
                          {category}{detail && ` · ${detail}`}{meters !== null && ` · ${formatDistance(meters)}`}
                        </div>
                        <div className="truncate text-xs text-stone-400">{p.roadAddress || p.address}</div>
                      </button>
                      <a href={p.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-stone-400 underline">
                        카카오맵
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {!isEnd && (
              <button onClick={() => search(page + 1)} disabled={loading}
                className="mt-3 w-full rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-semibold disabled:opacity-50">
                {loading ? '불러오는 중…' : '더 보기'}
              </button>
            )}
            <p className="mt-2 text-center text-xs text-stone-400">장소 정보 제공: 카카오</p>
          </section>
        )}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {[...selected.values()].map(({ place }) => (
                <span key={place.id} className="shrink-0"><Chip active onClick={() => toggle(place)}><span className="flex items-center gap-1">{place.name} <X className="size-3.5" /></span></Chip></span>
              ))}
            </div>
            <button onClick={add} className="shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white">
              {selected.size}곳 추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
