import { useMemo, useRef, useState } from 'react';
import { CircleCheck, Map, PartyPopper, Plus, Shuffle, Trash2, Utensils, X } from 'lucide-react';
import type { AppData } from '../types';
import type { Actions } from '../lib/useAppData';
import { indexAtTop, targetRotation, type WheelCandidate } from '../lib/wheel';
import { naverMapSearchUrl, newId, onEnter } from '../lib/utils';
import { StarBadge } from '../components/StarRating';

interface Props {
  data: AppData;
  actions: Actions;
  candidates: WheelCandidate[];
  setCandidates: (c: WheelCandidate[]) => void;
}

const MAX = 12;
// 따뜻한 색을 번갈아 (글자는 진한 갈색이라 모든 색에서 잘 보임)
const COLORS = ['#fb923c', '#fde68a', '#fca5a5', '#fed7aa', '#fbbf24', '#ffedd5', '#fdba74', '#fecdd3'];
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
      <section className="rounded-3xl bg-gradient-to-b from-orange-100 to-amber-50 px-4 pt-6 pb-5 shadow-inner">
        <div className={`relative mx-auto aspect-square w-full max-w-80 ${spinning ? 'wheel-spinning' : ''}`}>
          {/* 화살표 */}
          <div className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-3 drop-shadow-[0_3px_3px_rgba(0,0,0,0.25)]">
            <svg width="36" height="44" viewBox="0 0 36 44" aria-hidden>
              <path d="M18 43 C14 34 4 24 4 15 A14 14 0 0 1 32 15 C32 24 22 34 18 43 Z" fill="#c2410c" />
              <circle cx="18" cy="15" r="5.5" fill="#fff7ed" />
            </svg>
          </div>

          <svg
            viewBox="-100 -100 200 200"
            className="size-full drop-shadow-[0_8px_16px_rgba(194,65,12,0.25)]"
            role="img"
            aria-label={n ? `후보 ${n}개 돌림판` : '빈 돌림판'}
          >
            {/* 바깥 테두리 + 전구 */}
            <circle r="99" fill="#ea580c" />
            <circle r="91" fill="#fff7ed" />
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i / 24) * Math.PI * 2;
              return <circle key={i} className={`wheel-light ${i % 2 ? 'odd' : ''}`} cx={95 * Math.cos(a)} cy={95 * Math.sin(a)} r="2.2" />;
            })}

            {/* 도는 판 */}
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? `transform ${DURATION}ms cubic-bezier(0.12, 0.8, 0.18, 1)` : 'none',
              }}
            >
              {n === 0 && <circle r="88" fill="#ffedd5" />}
              {n === 1 && <circle r="88" fill={COLORS[0]} />}
              {n >= 2 &&
                candidates.map((c, i) => {
                  const seg = 360 / n;
                  const a0 = ((i * seg - 90) * Math.PI) / 180;
                  const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
                  const large = seg > 180 ? 1 : 0;
                  const d = `M0 0 L${88 * Math.cos(a0)} ${88 * Math.sin(a0)} A88 88 0 ${large} 1 ${88 * Math.cos(a1)} ${88 * Math.sin(a1)} Z`;
                  // 이웃한 칸·첫 칸과 마지막 칸이 같은 색이 되지 않게
                  let color = COLORS[i % COLORS.length];
                  if (i === n - 1 && i % COLORS.length === 0) color = COLORS[3];
                  const mid = i * seg + seg / 2;
                  const win = resultIdx === i;
                  return (
                    <g key={c.id}>
                      <path d={d} fill={win ? '#c2410c' : color} stroke="#fff7ed" strokeWidth="1.5" />
                      <SliceLabel label={c.label} mid={mid} n={n} win={win} />
                    </g>
                  );
                })}
              {n === 1 && (
                <text textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="800" fill="#431407" y="-48">
                  {candidates[0].label}
                </text>
              )}
              {n === 0 && (
                <text textAnchor="middle" dominantBaseline="central" fontSize="8.5" fill="#a8a29e" y="-46">
                  아래에서 후보를 넣어주세요
                </text>
              )}
            </g>
          </svg>

          {/* 가운데 버튼: 눌러도 돌아감 */}
          <button
            onClick={spin}
            disabled={n < 2 || spinning}
            aria-label="돌리기"
            className={`absolute top-1/2 left-1/2 flex size-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white text-sm font-black text-white shadow-lg transition active:scale-95 ${
              n < 2 ? 'bg-stone-400' : 'bg-orange-600'
            }`}
          >
            {spinning ? <Utensils className="size-5 animate-pulse" /> : 'GO'}
          </button>
        </div>

        <button
          onClick={spin}
          disabled={n < 2 || spinning}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-500 py-3.5 text-base font-bold text-white shadow-md shadow-orange-200 disabled:bg-stone-300 disabled:shadow-none"
        >
          <Shuffle className="size-5" /> {spinning ? '두근두근…' : n < 2 ? '후보를 2개 이상 넣어주세요' : '돌리기'}
        </button>
      </section>

      {/* 결과 */}
      {result && (
        <section key={`${result.id}-${rotation}`} className="animate-pop rounded-2xl border-2 border-orange-400 bg-white p-4 text-center shadow-lg shadow-orange-100">
          <p className="flex items-center justify-center gap-1 text-sm text-stone-500"><PartyPopper className="size-4 text-orange-500" /> 오늘은 여기!</p>
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
          onKeyDown={onEnter(() => q && !exactMatch && add({ label: q }))}
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

/**
 * 칸 글씨. 6칸 이하는 원을 따라 가로로 써서, 맨 위(화살표)에 멈춘 결과 칸 글씨가 똑바로 보이게.
 * 7칸 이상은 자리가 좁아서 중심에서 바깥쪽으로.
 */
function SliceLabel({ label, mid, n, win }: { label: string; mid: number; n: number; win: boolean }) {
  const fill = win ? '#fff' : '#431407';
  if (n <= 6) {
    const fontSize = n <= 3 ? 12 : n <= 4 ? 11 : 9.5;
    const radius = 60;
    const arc = ((2 * Math.PI * radius) / n) * 0.8; // 칸 너비(여유 20%)
    const max = Math.max(2, Math.floor(arc / (fontSize * 1.05)));
    const text = label.length > max ? label.slice(0, max - 1) + '…' : label;
    return (
      <text transform={`rotate(${mid}) translate(0 ${-radius})`} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight="800" fill={fill}>
        {text}
      </text>
    );
  }
  return (
    <text transform={`rotate(${mid - 90}) translate(56 0)`} textAnchor="middle" dominantBaseline="central" fontSize={n > 9 ? 7.5 : 8.5} fontWeight="800" fill={fill}>
      {label.length > 6 ? label.slice(0, 5) + '…' : label}
    </text>
  );
}
