import { useEffect, useMemo, useRef, useState } from 'react';
import { Coffee, Dices, RefreshCw, Sparkles, Utensils, UtensilsCrossed } from 'lucide-react';
import type { AppData, Companion, PriceLevel } from '../types';
import { COMPANIONS, PRICE_LEVELS } from '../types';
import type { Actions } from '../lib/useAppData';
import { makeJitter, recommend, type Conditions, type Kind, type Recommendation } from '../lib/recommend';
import { relativeDay, sortVisitsDesc, toDateStr } from '../lib/utils';
import { ALL_QUICK_TAGS, CAFE_QUICK_TAGS, DEFAULT_AREA, MOOD_TAGS, QUICK_TAGS, isCafeCategory } from '../data/defaults';
import { Chip, ChipGroup } from '../components/ChipGroup';
import { StarRating } from '../components/StarRating';
import { RecommendCard } from '../components/RecommendCard';

const PRICE_OPTIONS: (PriceLevel | null)[] = [null, ...PRICE_LEVELS];
const priceLabel = (p: PriceLevel | null) => p ?? '상관없음';
const isMood = (t: string) => (MOOD_TAGS as readonly string[]).includes(t);

interface Result {
  recs: Recommendation[];
  /** 이번 조건에서 지금까지 보여준 식당 */
  shown: Set<string>;
  notice?: string;
}

export function TodayPage({ data, actions, onAddRestaurant }: { data: AppData; actions: Actions; onAddRestaurant: () => void }) {
  const [cond, setCond] = useState<Conditions>({
    kind: '밥',
    area: data.areas.includes(DEFAULT_AREA) ? DEFAULT_AREA : data.areas[0] ?? '',
    companion: '혼밥',
    priceLevel: null,
    tags: [],
  });
  const [result, setResult] = useState<Result | null>(null);
  const [chosen, setChosen] = useState<{ restaurantId: string; visitId: string; date: string } | null>(null);
  const [spinIdx, setSpinIdx] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const spinTimer = useRef<number | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearInterval(spinTimer.current), []);

  // 지역이 삭제된 경우 대비
  useEffect(() => {
    if (!data.areas.includes(cond.area) && data.areas.length) setCond((c) => ({ ...c, area: data.areas[0] }));
  }, [data.areas, cond.area]);

  // 밥: 가볍게·자극적·술집 / 카페: 공부용·수다용·디저트용 이 항상 맨 앞, 그 뒤로 이 지역에 많이 붙은 태그
  const tagOptions = useMemo(() => {
    const quick = cond.kind === '카페' ? CAFE_QUICK_TAGS : QUICK_TAGS;
    const count = new Map<string, number>();
    data.restaurants
      .filter((r) => r.area === cond.area && isCafeCategory(r.category) === (cond.kind === '카페'))
      .flatMap((r) => r.tags)
      .filter((t) => !t.startsWith('도보') && !ALL_QUICK_TAGS.includes(t))
      .forEach((t) => count.set(t, (count.get(t) ?? 0) + 1));
    const others = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 6);
    return [...quick, ...others];
  }, [data.restaurants, cond.area, cond.kind]);

  const toggleTag = (t: string) => {
    if (cond.tags.includes(t)) return updateCond({ tags: cond.tags.filter((x) => x !== t) });
    // 가볍게 ↔ 자극적은 동시에 고를 수 없음
    const rest = isMood(t) ? cond.tags.filter((x) => !isMood(x)) : cond.tags;
    updateCond({ tags: [...rest, t] });
  };

  // 어제 이전 방문 중 아직 평가 안 한 가장 최근 것
  const today = toDateStr();
  const pendingVisit = useMemo(
    () => sortVisitsDesc(data.visits).find((v) => v.date < today && !v.stars && !v.ratingSkipped),
    [data.visits, today],
  );
  const pendingName = pendingVisit && data.restaurants.find((r) => r.id === pendingVisit.restaurantId)?.name;

  const updateCond = (patch: Partial<Conditions>) => {
    setCond((c) => ({ ...c, ...patch }));
    setResult(null); // 조건이 바뀌면 이전 결과는 지움 (새 추천은 버튼을 눌러야 생성)
    setPickedId(null);
  };

  const resetSpin = () => {
    window.clearInterval(spinTimer.current);
    setSpinIdx(null);
    setPickedId(null);
  };

  // 랜덤 점수는 버튼을 누를 때만 새로 만든다
  const run = (exclude: Set<string>) =>
    recommend(data, cond, {
      today,
      jitter: makeJitter(data.restaurants.map((r) => r.id)),
      exclude,
    });

  const onRecommend = () => {
    resetSpin();
    const recs = run(new Set());
    setResult({ recs, shown: new Set(recs.map((x) => x.restaurant.id)) });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const onAnother = () => {
    if (!result) return;
    resetSpin();
    let recs = run(result.shown);
    let shown = new Set([...result.shown, ...recs.map((x) => x.restaurant.id)]);
    let notice: string | undefined;
    if (recs.length === 0) {
      // 후보를 다 봤으면 지금 화면에 있는 곳만 빼고 처음부터 다시
      const current = new Set(result.recs.map((x) => x.restaurant.id));
      recs = run(current);
      shown = new Set(recs.map((x) => x.restaurant.id));
      notice = '후보를 한 바퀴 다 봤어요. 처음부터 다시 골라볼게요.';
      if (recs.length === 0) {
        recs = result.recs;
        notice = '이 조건에서는 이 식당들이 전부예요.';
      }
    }
    setResult({ recs, shown, notice });
  };

  const onPickForMe = () => {
    if (!result || result.recs.length === 0 || spinIdx !== null) return;
    setPickedId(null);
    const n = result.recs.length;
    const final = Math.floor(Math.random() * n);
    const totalSteps = n * 3 + final; // 3바퀴 돌고 멈춤
    let step = 0;
    setSpinIdx(0);
    spinTimer.current = window.setInterval(() => {
      step += 1;
      setSpinIdx(step % n);
      if (step >= totalSteps) {
        window.clearInterval(spinTimer.current);
        setSpinIdx(null);
        setPickedId(result.recs[final].restaurant.id);
      }
    }, 110);
  };

  const onChoose = (restaurantId: string) => {
    // 같은 날 마음을 바꿔 다른 곳을 고르면 방금 기록은 취소
    if (chosen && chosen.date === today) actions.deleteVisit(chosen.visitId);
    const visitId = actions.addVisit(restaurantId);
    setChosen({ restaurantId, visitId, date: today });
  };

  const onUndo = () => {
    if (!chosen) return;
    actions.deleteVisit(chosen.visitId);
    setChosen(null);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-sm font-black tracking-wide text-orange-500">Ansan Bite</h1>
        <p className="mt-1 text-2xl font-bold">오늘은 어디서 먹지?</p>
        <p className="mt-1 text-sm text-stone-500">지금 상황에 맞는 안산 맛집 3곳을 골라드려요.</p>
      </header>

      {data.restaurants.length === 0 && (
        <section className="rounded-2xl border-2 border-dashed border-orange-300 bg-white p-5 text-center">
          <UtensilsCrossed className="mx-auto size-9 text-orange-400" aria-hidden />
          <p className="mt-2 font-bold">먼저 내가 가는 식당을 등록해 주세요</p>
          <p className="mt-1 text-sm text-stone-500">지도 앱에서 공유 → 복사한 링크를 붙여넣으면 금방이에요.</p>
          <button onClick={onAddRestaurant} className="mt-3 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white">
            식당 등록하러 가기
          </button>
        </section>
      )}

      {pendingVisit && pendingName && (
        <section className="rounded-2xl border border-orange-200 bg-white p-4">
          <p className="text-sm font-semibold">
            {relativeDay(pendingVisit.date, today)} 먹은 <b>{pendingName}</b>, 어땠어?
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StarRating size="lg" onChange={(s) => s && actions.rateVisit(pendingVisit.id, s)} />
            <button onClick={() => actions.skipRating(pendingVisit.id)} className="text-xs text-stone-400 underline">
              건너뛰기
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
          {(['밥', '카페'] as Kind[]).map((k) => {
            const Icon = k === '밥' ? Utensils : Coffee;
            return (
              <button
                key={k}
                onClick={() => updateCond({ kind: k, tags: [] })}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold ${
                  cond.kind === k ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-500'
                }`}
              >
                <Icon className="size-4" /> {k === '밥' ? '밥' : '카페·빵집'}
              </button>
            );
          })}
        </div>
        <ChipGroup label="어디서 먹어?" options={data.areas} value={cond.area} onChange={(area) => updateCond({ area })} />
        <ChipGroup<Companion>
          label="누구랑?"
          options={COMPANIONS}
          value={cond.companion}
          onChange={(companion) => updateCond({ companion })}
        />
        <ChipGroup<PriceLevel | null>
          label="가격대?"
          options={PRICE_OPTIONS}
          value={cond.priceLevel}
          onChange={(priceLevel) => updateCond({ priceLevel })}
          render={priceLabel}
        />
        <div>
          <div className="mb-1.5 text-sm font-semibold text-stone-500">
            오늘은? <span className="font-normal text-stone-400">(고르면 그 태그가 붙은 곳만)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((t) => (
              <Chip key={t} active={cond.tags.includes(t)} onClick={() => toggleTag(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
        <button
          onClick={onRecommend}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-500 py-3.5 text-base font-bold text-white shadow-md shadow-orange-200 active:bg-orange-600"
        >
          <Sparkles className="size-5" /> 추천받기
        </button>
      </section>

      <div ref={resultRef} className="scroll-mt-4">
        {result && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">오늘은 여기 어때?</h2>
            {result.notice && <p className="text-sm text-stone-500">{result.notice}</p>}
            {result.recs.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-500">
                {cond.kind === '카페' && !data.restaurants.some((r) => isCafeCategory(r.category)) ? (
                  <>아직 등록한 카페·빵집이 없어요.<br /><b>내 식당 → 추가</b>에서 음식 종류를 <b>카페·빵집·디저트</b>로 고르면 여기 나와요.</>
                ) : (
                  <>조건에 맞는 곳이 없어요.<br />가격대·태그를 풀거나 동네를 바꾸거나, <b>내 식당</b>에서 추가해 보세요.</>
                )}
              </p>
            ) : (
              <>
                {result.recs.map((rec, i) => (
                  <RecommendCard
                    key={rec.restaurant.id}
                    rec={rec}
                    rank={i + 1}
                    highlighted={spinIdx === i || pickedId === rec.restaurant.id}
                    picked={pickedId === rec.restaurant.id}
                    chosen={chosen?.restaurantId === rec.restaurant.id}
                    onChoose={() => onChoose(rec.restaurant.id)}
                    onUndo={onUndo}
                  />
                ))}
                <div className="flex gap-2">
                  <button
                    onClick={onAnother}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-3 text-sm font-semibold text-stone-700 active:bg-stone-100"
                  >
                    <RefreshCw className="size-4" /> 다른 곳 추천
                  </button>
                  {result.recs.length > 1 && (
                    <button
                      onClick={onPickForMe}
                      disabled={spinIdx !== null}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-800 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <Dices className="size-4" /> 그냥 골라줘
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
