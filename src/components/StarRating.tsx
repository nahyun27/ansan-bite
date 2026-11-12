import { Star } from 'lucide-react';
import { STAR_LABEL } from '../types';

interface Props {
  value?: number;
  /** 없으면 보기 전용. 같은 별을 다시 누르면 지움(undefined) */
  onChange?: (stars: number | undefined) => void;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const SIZE = { sm: 'size-4', md: 'size-6', lg: 'size-8' } as const;

export function StarRating({ value, onChange, size = 'md', showLabel = false }: Props) {
  const readOnly = !onChange;
  return (
    <div className="flex items-center gap-2">
      <div className="flex" role={readOnly ? 'img' : 'radiogroup'} aria-label={value ? `별점 ${value}점` : '별점 없음'}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = !!value && n <= value;
          const star = <Star className={`${SIZE[size]} ${filled ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`} strokeWidth={1.75} />;
          return readOnly ? (
            <span key={n}>{star}</span>
          ) : (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n}점 ${STAR_LABEL[n]}`}
              onClick={() => onChange(value === n ? undefined : n)}
              className="p-0.5 active:scale-90"
            >
              {star}
            </button>
          );
        })}
      </div>
      {showLabel && value && <span className="text-sm font-semibold text-amber-600">{STAR_LABEL[value]}</span>}
    </div>
  );
}

/** 목록·카드용 작은 표시: ★4 */
export function StarBadge({ stars }: { stars?: number }) {
  if (!stars) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-600">
      <Star className="size-3 fill-amber-400 text-amber-400" /> {stars}
    </span>
  );
}
