interface Props<T> {
  label?: string;
  options: readonly T[];
  /** 단일 선택이면 T, 다중 선택이면 T[] */
  value: T | T[];
  onChange: (v: T) => void;
  render?: (v: T) => string;
}

export function ChipGroup<T extends string | number | null>({ label, options, value, onChange, render }: Props<T>) {
  const selected = (o: T) => (Array.isArray(value) ? value.includes(o) : value === o);
  return (
    <div>
      {label && <div className="mb-1.5 text-sm font-semibold text-stone-500">{label}</div>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={String(o)} active={selected(o)} onClick={() => onChange(o)}>
            {render ? render(o) : String(o)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? 'border-orange-500 bg-orange-500 font-semibold text-white'
          : 'border-stone-200 bg-white text-stone-700 active:bg-stone-100'
      }`}
    >
      {children}
    </button>
  );
}
