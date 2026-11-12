import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ClipboardPaste, Coffee, Link2, Loader, MapPin, Phone, Sparkles, TriangleAlert, Utensils, X } from 'lucide-react';
import type { Companion, PriceLevel, Restaurant } from '../types';
import { COMPANIONS, PRICE_LEVELS } from '../types';
import { ALL_QUICK_TAGS, CAFE_CATEGORIES, CAFE_SUGGESTED_TAGS, MEAL_CATEGORIES, MOOD_TAGS, SUGGESTED_TAGS, isCafeCategory } from '../data/defaults';
import { newId, onEnter, priceLevelOf } from '../lib/utils';
import { guessArea, parseShare, type ParsedShare } from '../lib/shareParse';
import { guessAutoTags, guessCategory } from '../lib/guessCategory';
import { fetchLinkPreview, isKakaoLink } from '../lib/linkPreview';
import { Chip, ChipGroup } from './ChipGroup';
import { StarRating } from './StarRating';

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
  const [f, setF] = useState<Restaurant>(
    () => initial ?? { id: newId(), name: '', area: defaultArea, category: '한식', menus: [], goodFor: ['혼밥', '친구랑'], tags: [] },
  );
  /** 음식 종류·메뉴를 직접 고쳤으면 자동 추측이 덮어쓰지 않음 */
  /** kind: 식당/카페를 직접 골랐으면 이름 추측이 종류를 바꾸지 않음 */
  const touched = useRef({ category: !isNew, menus: !isNew, tags: !isNew, kind: !isNew });
  const [pasteText, setPasteText] = useState('');
  const [pasteResult, setPasteResult] = useState<ParsedShare | null>(null);
  const [guessed, setGuessed] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const pasteSeq = useRef(0);
  const canReadClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  const [areaOptions, setAreaOptions] = useState(areas);
  const [newArea, setNewArea] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newMenu, setNewMenu] = useState('');
  const [error, setError] = useState('');

  // 폼이 열려 있는 동안 뒤쪽 페이지 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const set = (patch: Partial<Restaurant>) => setF((x) => ({ ...x, ...patch }));

  /** 이름(과 공유 텍스트)으로 음식 종류·메뉴·자동 태그(가볍게/자극적/술집) 추측해서 채우기 */
  const withGuess = (r: Restaurant, extraText?: string): Restaurant => {
    let g = guessCategory(r.name, extraText);
    // 식당/카페를 직접 골랐으면 다른 종류로 바꾸는 추측은 버림 (예: 카페인데 이름이 '○○국수')
    if (g && touched.current.kind && isCafeCategory(g.category) !== isCafeCategory(r.category)) g = null;
    setGuessed(!!g && !touched.current.category);
    const next: Restaurant = {
      ...r,
      category: g && !touched.current.category ? g.category : r.category,
      // 메뉴를 직접 건드리지 않았으면 이름이 바뀔 때마다 다시 추측 (추측이 없으면 비움 — 이전 추측이 남지 않게)
      menus: touched.current.menus ? r.menus : g?.menu ? [g.menu] : [],
    };
    return withAutoTags(next);
  };

  /** 자동 태그(가볍게/자극적/술집, 카페 용도)는 이름·분류가 바뀔 때마다 다시 계산. 태그를 직접 건드렸으면 그대로 */
  const withAutoTags = (r: Restaurant): Restaurant => {
    if (touched.current.tags) return r;
    const auto = guessAutoTags(r.name, r.menus.join(' '), r.category);
    return { ...r, tags: [...auto, ...r.tags.filter((t) => !ALL_QUICK_TAGS.includes(t))] };
  };

  const onPaste = async (text: string) => {
    setPasteText(text);
    const parsed = parseShare(text);
    setPasteResult(parsed);
    if (!parsed) return;
    setF((x) => withGuess(applyShare(x, parsed, areaOptions), text));

    // 카카오맵 링크인데 이름·주소가 비어 있으면 링크 미리보기에서 보충
    if (isKakaoLink(parsed.url) && (!parsed.name || !parsed.address)) {
      const seq = ++pasteSeq.current;
      setLoadingPreview(true);
      const preview = await fetchLinkPreview(parsed.url!);
      if (seq !== pasteSeq.current) return; // 그 사이 다시 붙여넣었으면 무시
      setLoadingPreview(false);
      if (!preview) return;
      const merged: ParsedShare = {
        ...parsed,
        name: parsed.name || preview.name || '',
        address: parsed.address ?? preview.address,
        kakaoId: parsed.kakaoId ?? preview.kakaoId,
      };
      setPasteResult(merged);
      setF((x) => withGuess(applyShare(x, merged, areaOptions), text));
    }
  };

  // 안드로이드 공유로 들어온 경우 바로 처리
  useEffect(() => {
    if (initialShare) void onPaste(initialShare);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readClipboard = async () => {
    try {
      await onPaste(await navigator.clipboard.readText());
    } catch {
      setError('클립보드를 읽지 못했어요. 아래 칸에 직접 붙여넣어 주세요.');
    }
  };

  const duplicate = existing.find(
    (r) =>
      r.id !== f.id &&
      ((f.kakaoId && r.kakaoId === f.kakaoId) || (f.mapUrl && r.mapUrl === f.mapUrl) || (f.name.trim() && r.name === f.name.trim())),
  );
  const isCafe = isCafeCategory(f.category);
  // 분류에 맞는 추천 태그가 맨 앞 (밥집: 가볍게·자극적·술집 / 카페: 공부용·수다용·디저트용)
  const tagOptions = [
    ...new Set([
      ...(isCafe ? CAFE_SUGGESTED_TAGS : SUGGESTED_TAGS),
      ...f.tags,
      ...allTags.filter((t) => !ALL_QUICK_TAGS.includes(t) && !t.startsWith('도보')),
    ]),
  ];
  const kindCategories = isCafe ? CAFE_CATEGORIES : MEAL_CATEGORIES;
  const categoryOptions = kindCategories.includes(f.category) ? kindCategories : [...kindCategories, f.category];

  const setKind = (cafe: boolean) => {
    touched.current.kind = true;
    if (cafe === isCafe) return;
    touched.current.category = false; // 새 종류 안에서는 이름으로 다시 추측
    setF((x) => {
      const g = guessCategory(x.name);
      const category = g && isCafeCategory(g.category) === cafe ? g.category : cafe ? '카페' : '한식';
      setGuessed(!!g && isCafeCategory(g.category) === cafe);
      return withAutoTags({ ...x, category });
    });
  };

  const isMood = (t: string) => (MOOD_TAGS as readonly string[]).includes(t);
  const toggleTag = (t: string) => {
    touched.current.tags = true;
    if (f.tags.includes(t)) return set({ tags: f.tags.filter((x) => x !== t) });
    // 가볍게 ↔ 자극적은 하나만
    set({ tags: [...(isMood(t) ? f.tags.filter((x) => !isMood(x)) : f.tags), t] });
  };
  const currentLevel = priceLevelOf(f);

  const addArea = () => {
    const a = newArea.trim();
    if (!a) return;
    if (!areaOptions.includes(a)) setAreaOptions([...areaOptions, a]);
    set({ area: a });
    setNewArea('');
  };

  const addMenu = () => {
    // 쉼표로 여러 개 한 번에 입력 가능
    const items = newMenu.split(/[,，、]/).map((m) => m.trim()).filter((m) => m && !f.menus.includes(m));
    if (items.length) {
      touched.current.menus = true;
      setF((x) => withAutoTags({ ...x, menus: [...x.menus, ...items] }));
    }
    setNewMenu('');
  };
  const removeMenu = (m: string) => {
    touched.current.menus = true;
    set({ menus: f.menus.filter((x) => x !== m) });
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
      menus: [...f.menus, ...newMenu.split(/[,，、]/).map((m) => m.trim()).filter(Boolean)].filter((m, i, a) => a.indexOf(m) === i),
      mapUrl: f.mapUrl?.trim() || undefined,
      memo: f.memo?.trim() || undefined,
      price: f.price && f.price > 0 ? f.price : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-orange-50">
      <form id="restaurant-form" onSubmit={submit} className="mx-auto max-w-md space-y-5 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-36">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="flex items-center text-sm text-stone-500">
            <ChevronLeft className="size-4" /> 취소
          </button>
          <h2 className="text-lg font-bold">{isCafe ? '카페' : '식당'} {initial ? '수정' : '추가'}</h2>
          <span className="w-12" />
        </div>

        {isNew && (
          <section className="space-y-2 rounded-2xl border-2 border-dashed border-orange-300 bg-white p-3">
            <div className="flex items-center gap-1.5 text-sm font-bold text-orange-600">
              <Link2 className="size-4" /> 지도 링크로 채우기
            </div>
            <p className="text-xs text-stone-500">
              카카오맵·네이버지도에서 식당을 열고 <b>공유 → 복사</b>한 뒤 붙여넣으세요. 음식 종류는 이름을 보고 추측해서 채워요.
            </p>
            {canReadClipboard && (
              <button type="button" onClick={readClipboard} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white">
                <ClipboardPaste className="size-4" /> 복사한 내용 붙여넣기
              </button>
            )}
            <textarea
              className={input + ' text-sm'}
              rows={pasteText ? 4 : 2}
              value={pasteText}
              onChange={(e) => void onPaste(e.target.value)}
              placeholder="여기에 길게 눌러 붙여넣기"
              autoFocus={pasteFirst && !canReadClipboard}
            />
            {loadingPreview && (
              <p className="flex items-center gap-1 text-xs text-stone-500">
                <Loader className="size-3.5 animate-spin" /> 링크에서 식당 정보를 가져오는 중…
              </p>
            )}
            {pasteResult && !loadingPreview && (
              <p className="flex items-start gap-1 text-xs text-green-700">
                <Check className="mt-px size-3.5 shrink-0" />
                <span>
                  {pasteResult.source}에서 {withObjectParticle(filledFields(pasteResult))} 채웠어요.
                  {!pasteResult.name && ' 이름은 직접 적어주세요.'}
                </span>
              </p>
            )}
            {pasteText && !pasteResult && <p className="text-xs text-red-500">링크나 식당 이름을 찾지 못했어요.</p>}
          </section>
        )}

        <div>
          <label className={label}>어떤 곳?</label>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200/60 p-1">
            {[false, true].map((cafe) => {
              const Icon = cafe ? Coffee : Utensils;
              const active = isCafe === cafe;
              return (
                <button
                  key={String(cafe)}
                  type="button"
                  onClick={() => setKind(cafe)}
                  aria-pressed={active}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold ${
                    active ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-500'
                  }`}
                >
                  <Icon className="size-4" /> {cafe ? '카페·빵집' : '식당'}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={label}>{isCafe ? '카페 이름' : '식당 이름'} *</label>
          <input
            className={input}
            value={f.name}
            onChange={(e) => setF((x) => (isNew ? withGuess({ ...x, name: e.target.value }) : { ...x, name: e.target.value }))}
            placeholder="예: 학교앞 국밥집"
            autoFocus={isNew && !pasteFirst}
          />
          {duplicate && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-600">
              <TriangleAlert className="size-3.5" /> 이미 저장된 식당 같아요: {duplicate.name} ({duplicate.area})
            </p>
          )}
        </div>

        <div>
          <label className={label}>내 별점 <span className="font-normal text-stone-400">(가본 곳이면)</span></label>
          <StarRating value={f.stars} onChange={(stars) => set({ stars })} showLabel />
        </div>

        <div>
          <ChipGroup label="지역" options={areaOptions} value={f.area} onChange={(area) => set({ area })} />
          <div className="mt-2 flex gap-2">
            <input className={input} value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="새 지역 추가 (예: 한대앞역)"
              onKeyDown={onEnter(addArea)} />
            <button type="button" onClick={addArea} className="shrink-0 rounded-xl bg-stone-200 px-3 text-sm font-medium">추가</button>
          </div>
        </div>

        <div>
          <ChipGroup
            label={isCafe ? '종류' : '음식 종류'}
            options={categoryOptions}
            value={f.category}
            onChange={(category) => {
              touched.current.category = true;
              setGuessed(false);
              setF((x) => withAutoTags({ ...x, category }));
            }}
          />
          {guessed && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-orange-600">
              <Sparkles className="size-3.5" /> 이름을 보고 추측했어요. 틀리면 눌러서 바꿔주세요.
            </p>
          )}
        </div>

        <div>
          <label className={label}>대표 메뉴 <span className="font-normal text-stone-400">(여러 개 가능)</span></label>
          {f.menus.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {f.menus.map((m) => (
                <span key={m} className="flex items-center gap-1 rounded-full bg-orange-100 py-1 pr-1.5 pl-3 text-sm text-orange-800">
                  {m}
                  <button type="button" onClick={() => removeMenu(m)} aria-label={`${m} 빼기`} className="rounded-full p-0.5 active:bg-orange-200">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className={input}
              value={newMenu}
              onChange={(e) => setNewMenu(e.target.value)}
              onKeyDown={onEnter(addMenu)}
              placeholder={isCafe ? '예: 아인슈페너, 소금빵' : '예: 마라탕, 꿔바로우'}
            />
            <button type="button" onClick={addMenu} className="shrink-0 rounded-xl bg-stone-200 px-3 text-sm font-medium">추가</button>
          </div>
        </div>

        <div>
          <ChipGroup<PriceLevel>
            label="가격대"
            options={PRICE_LEVELS}
            value={currentLevel ?? []}
            onChange={(lv) => set({ priceLevel: f.priceLevel === lv ? undefined : lv })}
          />
          <div className="mt-2 flex items-center gap-2">
            <input className={input + ' w-36'} type="number" inputMode="numeric" step={500} min={0} value={f.price ?? ''} placeholder="1인 가격(원)"
              onChange={(e) => set({ price: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <span className="text-xs text-stone-400">
              {f.price !== undefined && !f.priceLevel ? '가격으로 가격대를 정했어요' : '정확한 가격은 몰라도 OK'}
            </span>
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
              onKeyDown={onEnter(addTag)} />
            <button type="button" onClick={addTag} className="shrink-0 rounded-xl bg-stone-200 px-3 text-sm font-medium">추가</button>
          </div>
        </div>

        <div>
          <label className={label}>지도 링크 <span className="font-normal text-stone-400">(비우면 네이버지도 검색)</span></label>
          <input className={input} type="url" value={f.mapUrl ?? ''} onChange={(e) => set({ mapUrl: e.target.value })} placeholder="https://naver.me/..." />
        </div>

        {(f.address || f.phone) && (
          <div className="space-y-1 rounded-xl bg-white px-3 py-2 text-xs text-stone-500">
            {f.address && <p className="flex items-center gap-1"><MapPin className="size-3.5 shrink-0" /> {f.address}</p>}
            {f.phone && <p className="flex items-center gap-1"><Phone className="size-3.5 shrink-0" /> {f.phone}</p>}
          </div>
        )}

        <div>
          <label className={label}>메모</label>
          <textarea className={input} rows={2} value={f.memo ?? ''} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 월요일 휴무, 2층 자리 넓음" />
        </div>

        {onDelete && (
          <button type="button" onClick={onDelete} className="w-full py-2 text-sm text-red-500">이 식당 삭제</button>
        )}
      </form>

      {/* 저장 버튼은 항상 화면 아래에 — 붙여넣고 바로 저장 가능 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
        <div className="mx-auto max-w-md">
          {error && <p className="mb-2 text-sm font-semibold text-red-500">{error}</p>}
          <button type="submit" form="restaurant-form" className="w-full rounded-2xl bg-orange-500 py-3.5 font-bold text-white active:bg-orange-600">
            저장{isNew && ' (나머지는 나중에 채워도 돼요)'}
          </button>
        </div>
      </div>
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
