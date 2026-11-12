import type { Rating } from '../types';
import { RATING_EMOJI, RATING_LABEL } from '../types';

const RATINGS: Rating[] = ['again', 'okay', 'nope'];

export function RatingButtons({ value, onChange, size = 'md' }: { value?: Rating; onChange: (r: Rating) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex gap-1.5">
      {RATINGS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-full border ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'} ${
            value === r ? 'border-orange-500 bg-orange-50 font-semibold text-orange-700' : 'border-stone-200 bg-white text-stone-600'
          }`}
        >
          {RATING_EMOJI[r]} {RATING_LABEL[r]}
        </button>
      ))}
    </div>
  );
}
