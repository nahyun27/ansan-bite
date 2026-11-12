import { useEffect, useState } from 'react';
import type { Companion, Restaurant } from '../types';
import { COMPANIONS } from '../types';
import { CATEGORIES, SUGGESTED_TAGS } from '../data/defaults';
import { newId } from '../lib/utils';
import { guessArea, parseShare, type ParsedShare } from '../lib/shareParse';
import { Chip, ChipGroup } from './ChipGroup';

interface Props {
  initial?: Restaurant;
  areas: string[];
  allTags: string[];
  defaultArea: string;
  /** 중복 확인용 */
  existing: Restaurant[];
  /** 새 식당일 때 붙여넣기 칸을 펼쳐서 시작 */
  pasteFirst?: boolean;
  /** 안드로이드 공유로 들어온 텍스트 */
  initialShare?: string;
  onSave: (r: Restaurant) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const input = 'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base outline-none focus:border-orange-400';
const label = 'mb-1.5 block text-sm font-semibold text-stone-500';

export function RestaurantForm({ initial, areas, allTags, defaultArea, existing, pasteFirst, initialShare, onSave, onDelete, onClose }: Props) {
  const isNew = !initial;
  const [f, setF] = useState<Restaurant>(() => {
    const base: Restaurant = initial ?? { id: newId(), name: '', area: defaultArea, category: '한식', menu: '', goodFor: ['혼밥', '친구랑'], tags: [] };
    const shared = initialShare ? parseShare(initialShare) : null;
    return shared ? applyShare(base, shared, areas) : base;
  });
  const [pasteText, setPasteText] = useState(initialShare ?? '');
  const [pasteResult, setPasteResult] = useState<ParsedShare | null>(() => (initialShare ? parseShare(initialShare) : null));
  const canReadClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  const [areaOptions, setAreaOptions] = useState(areas);
  const [newArea, setNewArea] = useState('');
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState('');

  // 폼이 열려 있는 동안 뒤쪽 페이지 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const set = (patch: Partial<Restaurant>) => setF((x) => ({ ...x, ...patch }));

  const onPaste = (text: string) => {
    setPasteText(text);
    const parsed = parseShare(text);
    setPasteResult(parsed);
    if (parsed) setF((x) => applyShare(x, parsed, areaOptions));
  };

  const readClipboard = async () => {
    try {
      onPaste(await navigator.clipboard.readText());
    } catch {
      setError('클립보드를 읽지 못했어요. 아래 칸에 직접 붙여넣어 주세요.');
    }
  };

  const duplicate = existing.find(
    (r) =>
      r.id !== f.id &&
      ((f.kakaoId && r.kakaoId === f.kakaoId) || (f.mapUrl && r.mapUrl === f.mapUrl) || (f.name.trim() && r.name === f.name.trim())),
  );
  const tagOptions = [...new Set([...SUGGESTED_TAGS, ...allTags, ...f.tags])];
  const categoryOptions = CATEGORIES.includes(f.category) ? CATEGORIES : [...CATEGORIES, f.category];

  const toggleTag = (t: string) => set({ tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] });

  const addArea = () => {
    const a = newArea.trim();
    if (!a) return;
    if (!areaOptions.includes(a)) setAreaOptions([...areaOptions, a]);
    set({ area: a });
    setNewArea('');
  };

  const addTag = () => {
    const t = newTag.trim().replace(/^#/, '');
    if (t && !f.tags.includes(t)) set({ tags: [...f.tags, t] });
    setNewTag('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('식당 이름을 적어주세요.');
    if (f.goodFor.length === 0) return setError('누구랑 갈 곳인지 하나 이상 골라주세요.');
    onSave({
      ...f,
      name: f.name.trim(),
      menu: f.menu.trim(),
      mapUrl: f.mapUrl?.trim() || undefined,
      memo: f.memo?.trim() || undefined,
      price: f.price && f.price > 0 ? f.price : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-orange-50">
      <form onSubmit={submit} className="mx-auto max-w-md space-y-5 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-32">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sm text-stone-500">← 취소</button>
          <h2 className="text-lg font-bold">{initial ? '식당 수정' : '식당 추가'}</h2>
          <span className="w-12" />
        </div>

        {isNew && (
          <section className="space-y-2 rounded-2xl border-2 border-dashed border-orange-300 bg-white p-3">
            <div className="text-sm font-bold text-orange-600">🔗 지도 링크로 채우기</div>
            <p className="text-xs text-stone-500">카카오맵·네이버지도에서 식당을 열고 <b>공유 → 복사</b>한 뒤 붙여넣으세요.</p>
            {canReadClipboard && (
              <button type="button" onClick={readClipboard} className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white">
                📋 복사한 내용 붙여넣기
              </button>
            )}
            <textarea
              className={input + ' text-sm'}
              rows={pasteText ? 4 : 2}
              value={pasteText}
              onChange={(e) => onPaste(e.target.value)}
              placeholder="여기에 길게 눌러 붙여넣기"
              autoFocus={pasteFirst && !canReadClipboard}
            />
            {pasteResult && (
              <p className="text-xs text-green-700">
                ✓ {pasteResult.source}에서 {withObjectParticle(filledFields(pasteResult))} 채웠어요.
                {!pasteResult.name && ' 이름은 직접 적어주세요.'}
              </p>
            )}
            {pasteText && !pasteResult && <p className="text-xs text-red-500">링크나 식당 이름을 찾지 못했어요.</p>}
          </section>
        )}

        <div>
          <label className={label}>식당 이름 *</label>
          <input className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="예: 든든국밥" autoFocus={isNew && !pasteFirst} />
          {duplicate && <p className="mt-1 text-xs font-semibold text-amber-600">⚠️ 이미 저장된 식당 같아요: {duplicate.name} ({duplicate.area})</p>}
        </div>

        <div>
          <ChipGroup label="지역" options={areaOptions} value={f.area} onChange={(area) => set({ area })} />
          <div className="mt-2 flex gap-2">
            <input className={input} value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="새 지역 추가 (예: 한대앞역)"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addArea())} />
            <button type="button" onClick={addArea} className="shrink-0 rounded-xl bg-stone-200 px-3 text-sm font-medium">추가</button>
          </div>
        </div>

        <ChipGroup label="음식 종류" options={categoryOptions} value={f.category} onChange={(category) => set({ category })} />

        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <div>
            <label className={label}>대표 메뉴</label>
            <input className={input} value={f.menu} onChange={(e) => set({ menu: e.target.value })} placeholder="예: 순대국밥" />
          </div>
          <div>
            <label className={label}>1인 가격(원)</label>
            <input className={input} type="number" inputMode="numeric" step={500} min={0} value={f.price ?? ''} placeholder="몰라도 OK"
              onChange={(e) => set({ price: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
        </div>

        <ChipGroup<Companion>
          label="누구랑 가기 좋아?"
          options={COMPANIONS}
          value={f.goodFor}
          onChange={(c) => set({ goodFor: f.goodFor.includes(c) ? f.goodFor.filter((x) => x !== c) : [...f.goodFor, c] })}
        />

        <div>
          <label className={label}>태그</label>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((t) => (
              <Chip key={t} active={f.tags.includes(t)} onClick={() => toggleTag(t)}>#{t}</Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className={input} value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="새 태그 (예: 남자친구랑)"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
            <button type="button" onClick={addTag} className="shrink-0 rounded-xl bg-stone-200 px-3 text-sm font-medium">추가</button>
          </div>
        </div>

        <div>
          <label className={label}>지도 링크 <span className="font-normal text-stone-400">(비우면 네이버지도 검색)</span></label>
          <input className={input} type="url" value={f.mapUrl ?? ''} onChange={(e) => set({ mapUrl: e.target.value })} placeholder="https://naver.me/..." />
        </div>

        {(f.address || f.phone) && (
          <p className="rounded-xl bg-white px-3 py-2 text-xs text-stone-500">
            📍 {f.address} {f.phone && <>· ☎ {f.phone}</>}
          </p>
        )}

        <div>
          <label className={label}>메모</label>
          <textarea className={input} rows={2} value={f.memo ?? ''} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 월요일 휴무, 2층 자리 넓음" />
        </div>

        {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

        <button type="submit" className="w-full rounded-2xl bg-orange-500 py-3.5 font-bold text-white active:bg-orange-600">저장</button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="w-full py-2 text-sm text-red-500">이 식당 삭제</button>
        )}
      </form>
    </div>
  );
}

/** 붙여넣은 정보로 채우기: 이름은 비어 있을 때만, 링크·주소·전화는 새 값으로 */
function applyShare(r: Restaurant, s: ParsedShare, areas: string[]): Restaurant {
  return {
    ...r,
    name: r.name.trim() ? r.name : s.name,
    mapUrl: s.url ?? r.mapUrl,
    address: s.address ?? r.address,
    phone: s.phone ?? r.phone,
    kakaoId: s.kakaoId ?? r.kakaoId,
    area: guessArea(s.address, areas) ?? r.area,
  };
}

function filledFields(p: ParsedShare): string {
  return [p.name && '이름', p.url && '지도 링크', p.address && '주소', p.phone && '전화번호'].filter(Boolean).join(', ');
}

/** 받침에 따라 을/를 */
function withObjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasBatchim ? '을' : '를');
}
