import { CircleCheck, Map } from 'lucide-react';
import type { Recommendation } from '../lib/recommend';
import { naverMapSearchUrl, priceText } from '../lib/utils';
import { StarBadge } from './StarRating';

interface Props {
  rec: Recommendation;
  rank: number;
  chosen: boolean;
  onChoose: () => void;
  onUndo: () => void;
}

export function RecommendCard({ rec, rank, chosen, onChoose, onUndo }: Props) {
  const r = rec.restaurant;
  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-all ${
        'border-stone-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-orange-500">추천 {rank}</div>
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-lg font-bold">{r.name}</h3>
            <StarBadge stars={r.stars} />
          </div>
          <p className="text-sm text-stone-500">
            {r.category}{r.menus.length > 0 && ` · ${r.menus.slice(0, 3).join(', ')}`} · {priceText(r)}
          </p>
        </div>
      </div>
      <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-stone-700">
        “{rec.reasons.slice(0, 2).join(' ')}”
      </p>
      {r.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.tags.map((t) => (
            <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">#{t}</span>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <a
          href={r.mapUrl || naverMapSearchUrl(r.name)}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-stone-200 py-2 text-sm font-medium text-stone-700 active:bg-stone-100"
        >
          <Map className="size-4" /> 지도 보기
        </a>
        {chosen ? (
          <button onClick={onUndo} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-100 py-2 text-sm font-medium text-stone-600">
            <CircleCheck className="size-4 text-green-600" /> 기록됨 · 취소
          </button>
        ) : (
          <button onClick={onChoose} className="flex-1 rounded-xl bg-orange-500 py-2 text-sm font-bold text-white active:bg-orange-600">
            여기 먹을래
          </button>
        )}
      </div>
    </article>
  );
}
