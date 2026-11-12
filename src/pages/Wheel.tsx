import { useMemo, useRef, useState } from 'react';
import { CircleCheck, Map, Plus, Shuffle, Trash2, X } from 'lucide-react';
import type { AppData } from '../types';
import type { Actions } from '../lib/useAppData';
import { indexAtTop, targetRotation, type WheelCandidate } from '../lib/wheel';
import { naverMapSearchUrl, newId } from '../lib/utils';
import { StarBadge } from '../components/StarRating';

interface Props {
  data: AppData;
  actions: Actions;
  candidates: WheelCandidate[];
  setCandidates: (c: WheelCandidate[]) => void;
}

const MAX = 12;
const COLORS = ['#fdba74', '#fed7aa', '#fb923c', '#ffedd5', '#fcd34d', '#fde68a'];
const DURATION = 4000;

export function WheelPage({ data, actions, candidates, setCandidates }: Props) {
  const [query, setQuery] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [resultIdx, setResultIdx] = useState<number | null>(null);
  const [recorded, setRecorded] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const n = candidates.length;
  const q = query.trim();

  // 검색어가 없으면 별점 높은 순, 있으면 이름·메뉴로 찾기
  const suggestions = useMemo(() => {
    const inWheel = new Set(candidates.map((c) => c.restaurantId).filter(Boolean));
    const lower = q.toLowerCase();
    return data.restaurants
      .filter((r) => !inWheel.has(r.id))
      .filter((r) => !lower || [r.name, ...r.menus, r.category].some((s) => s.toLowerCase().includes(lower)))
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.name.localeCompare(b.name, 'ko'))
      .slice(0, 8);
  }, [data.restaurants, candidates, q]);

  const reset = () => {
    setResultIdx(null);
    setRecorded(null);
  };

  const add = (c: Omit<WheelCandidate, 'id'>) => {
    if (n >= MAX || spinning) return;
    reset();
    setCandidates([...candidates, { ...c, id: newId() }]);
    setQuery('');
  };

  const remove = (id: string) => {
    if (spinning) return;
    reset();
    setCandidates(candidates.filter((c) => c.id !== id));
  };

  const spin = () => {
    if (n < 2 || spinning) return;
    reset();
    const index = Math.floor(Math.random() * n);
    const next = targetRotation(rotation, index, n, 5, Math.random() - 0.5);
    setSpinning(true);
    setRotation(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSpinning(false);
      setResultIdx(indexAtTop(next, n));
    }, DURATION + 100);
  };

  const result = resultIdx !== null ? candidates[resultIdx] : undefined;
  const resultRestaurant = result?.restaurantId ? data.restaurants.find((r) => r.id === result.restaurantId) : undefined;
  const exactMatch = data.restaurants.some((r) => r.name === q) || candidates.some((c) => c.label === q);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">돌림판</h1>
        <p className="mt-1 text-sm text-stone-500">후보를 넣고 돌려보세요. 정말 못 고르겠을 때!</p>
      </header>

      {/* 돌림판 */}
      <section className="relative mx-auto aspect-square w-full max-w-80">
        {/* 화살표 */}
        <div className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1">
          <svg width="28" height="30" viewBox="0 0 28 30" aria-hidden>
            <path d="M14 30 L2 4 Q14 -2 26 4 Z" fill="#292524" />
          </svg>
        </div>
        <svg
          viewBox="-100 -100 200 200"
          className="size-full drop-shadow-md"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${DURATION}ms cubic-bezier(0.12, 0.8, 0.18, 1)` : 'none',
          }}
          role="img"
          aria-label={n ? `후보 ${n}개 돌림판` : '빈 돌림판'}
        >
          <circle r="98" fill="#fff" stroke="#fed7aa" strokeWidth="2" />
          {n === 1 && <circle r="96" fill={COLORS[0]} />}
          {n >= 2 &&
            candidates.map((c, i) => {
              const seg = 360 / n;
              const a0 = ((i * seg - 90) * Math.PI) / 180;
              const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
              const large = seg > 180 ? 1 : 0;
              const d = `M0 0 L${96 * Math.cos(a0)} ${96 * Math.sin(a0)} A96 96 0 ${large} 1 ${96 * Math.cos(a1)} ${96 * Math.sin(a1)} Z`;
              // 마지막 칸이 첫 칸과 같은 색이 되지 않게
              let color = COLORS[i % COLORS.length];
              if (i === n - 1 && i % COLORS.length === 0) color = COLORS[2];
              const mid = i * seg + seg / 2;
              const highlight = resultIdx === i;
              return (
                <g key={c.id}>
                  <path d={d} fill={highlight ? '#f97316' : color} stroke="#fff" strokeWidth="1.5" />
                  <text
                    transform={`rotate(${mid - 90}) translate(58 0)`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={n > 8 ? 7.5 : 9.5}
                    fontWeight="700"
                    fill={highlight ? '#fff' : '#431407'}
                  >
                    {c.label.length > 7 ? c.label.slice(0, 6) + '…' : c.label}
                  </text>
                </g>
              );
            })}
          {n === 1 && (
            <text textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#431407" y="-40">
              {candidates[0].label}
            </text>
          )}
          {n === 0 && (
            <text textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#a8a29e">
              아래에서 후보를 넣어주세요
            </text>
          )}
          <circle r="14" fill="#fff" stroke="#fdba74" strokeWidth="2" />
        </svg>
      </section>

      <button
        onClick={spin}
        disabled={n < 2 || spinning}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-500 py-3.5 text-base font-bold text-white shadow-md shadow-orange-200 disabled:bg-stone-300 disabled:shadow-none"
      >
        <Shuffle className="size-5" /> {spinning ? '돌아가는 중…' : n < 2 ? '후보를 2개 이상 넣어주세요' : '돌리기'}
      </button>

      {/* 결과 */}
      {result && (
        <section className="rounded-2xl border-2 border-orange-400 bg-white p-4 text-center">
          <p className="text-sm text-stone-500">오늘은</p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <p className="text-2xl font-black text-orange-600">{result.label}</p>
            <StarBadge stars={resultRestaurant?.stars} />
          </div>
          {resultRestaurant && (
            <div className="mt-3 flex gap-2">
              <a
                href={resultRestaurant.mapUrl || naverMapSearchUrl(resultRestaurant.name)}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-stone-200 py-2 text-sm font-medium text-stone-700"
              >
                <Map className="size-4" /> 지도 보기
              </a>
              {recorded === result.id ? (
                <span className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-100 py-2 text-sm font-medium text-stone-600">
                  <CircleCheck className="size-4 text-green-600" /> 기록했어요
                </span>
              ) : (
                <button
                  onClick={() => {
                    actions.addVisit(resultRestaurant.id);
                    setRecorded(result.id);
                  }}
                  className="flex-1 rounded-xl bg-orange-500 py-2 text-sm font-bold text-white"
                >
                  여기 먹을래
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* 후보 */}
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">
            후보 <span className="text-sm font-normal text-stone-400">{n}/{MAX}</span>
          </h2>
          {n > 0 && (
            <button onClick={() => { reset(); setCandidates([]); }} disabled={spinning} className="flex items-center gap-1 text-xs text-stone-400">
              <Trash2 className="size-3.5" /> 모두 빼기
            </button>
          )}
        </div>

        {n > 0 && (
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full bg-orange-100 py-1 pr-1.5 pl-3 text-sm text-orange-800">
                {c.label}
                <button onClick={() => remove(c.id)} aria-label={`${c.label} 빼기`} className="rounded-full p-0.5 active:bg-orange-200">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q && !exactMatch && add({ label: q })}
          placeholder="내 식당 검색 또는 직접 입력 (예: 편의점)"
          disabled={n >= MAX}
          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 outline-none focus:border-orange-400 disabled:bg-stone-100"
        />

        <div className="flex flex-wrap gap-2">
          {q && !exactMatch && (
            <button onClick={() => add({ label: q })} className="flex items-center gap-1 rounded-full border border-dashed border-orange-400 px-3 py-1.5 text-sm text-orange-700">
              <Plus className="size-3.5" /> ‘{q}’ 직접 넣기
            </button>
          )}
          {suggestions.map((r) => (
            <button
              key={r.id}
              onClick={() => add({ label: r.name, restaurantId: r.id })}
              className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 active:bg-stone-100"
            >
              <Plus className="size-3.5 text-stone-400" /> {r.name}
            </button>
          ))}
        </div>
        {data.restaurants.length === 0 && !q && (
          <p className="text-xs text-stone-400">내 식당에 등록한 곳이 여기 후보로 나와요. 직접 입력해서 넣어도 돼요.</p>
        )}
      </section>
    </div>
  );
}
