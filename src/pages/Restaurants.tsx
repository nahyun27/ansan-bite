import { useEffect, useMemo, useState } from 'react';
import { Link2, Plus, Search } from 'lucide-react';
import type { AppData, Restaurant } from '../types';
import type { Actions } from '../lib/useAppData';
import { lastVisitDate, needsInfo, priceText, relativeDay, toDateStr } from '../lib/utils';
import { DEFAULT_AREA, isCafeCategory } from '../data/defaults';
import { Chip } from '../components/ChipGroup';
import { RestaurantForm } from '../components/RestaurantForm';
import { KakaoImport } from '../components/KakaoImport';
import { AvgStars, StarBadge } from '../components/StarRating';

const ALL = '전체';
type Kind = '전체' | '식당' | '카페';
type Service = '전체' | '배달' | '포장';
const KINDS: { v: Kind; label: string }[] = [{ v: '전체', label: '전체' }, { v: '식당', label: '식당' }, { v: '카페', label: '카페·빵집' }];
const SERVICES: Service[] = ['전체', '배달', '포장'];

/** 작은 구간 선택 버튼 (전체/식당/카페 등) */
function Segmented<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-stone-200/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold whitespace-nowrap ${value === o.v ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-500'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
/** 카카오 장소 검색은 API 키(+카드 등록)가 필요해서 기본은 숨김. .env.local에 VITE_ENABLE_KAKAO_IMPORT=true로 켬 */
const KAKAO_IMPORT_ENABLED = import.meta.env.VITE_ENABLE_KAKAO_IMPORT === 'true';

type Editing = { kind: 'edit'; restaurant: Restaurant } | { kind: 'new'; pasteFirst: boolean; share?: string };

interface Props {
  data: AppData;
  actions: Actions;
  /** 안드로이드 공유로 들어온 텍스트 */
  incomingShare?: string;
  onShareConsumed?: () => void;
  /** 공유 모드 닉네임 */
  nick?: string;
}

export function RestaurantsPage({ data, actions, incomingShare, onShareConsumed, nick }: Props) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState(ALL);
  const [kind, setKind] = useState<Kind>('전체');
  const [service, setService] = useState<Service>('전체');
  const [needsOnly, setNeedsOnly] = useState(false);
  const filtering = area !== ALL || kind !== '전체' || service !== '전체' || needsOnly || !!query.trim();
  const resetFilters = () => {
    setArea(ALL);
    setKind('전체');
    setService('전체');
    setNeedsOnly(false);
    setQuery('');
  };
  const [editing, setEditing] = useState<Editing | null>(null);

  useEffect(() => {
    if (!incomingShare) return;
    setEditing({ kind: 'new', pasteFirst: true, share: incomingShare });
    onShareConsumed?.();
  }, [incomingShare, onShareConsumed]);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const needsInfoCount = data.restaurants.filter(needsInfo).length;
  // 보충할 식당을 다 채우면 '보충 필요' 필터에서 자동으로 빠져나옴
  if (needsOnly && needsInfoCount === 0) setNeedsOnly(false);
  // 지역이 지워졌으면 전체로
  if (area !== ALL && !data.areas.includes(area)) setArea(ALL);
  const today = toDateStr();

  const allTags = useMemo(() => [...new Set(data.restaurants.flatMap((r) => r.tags))], [data.restaurants]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.restaurants
      .filter((r) => area === ALL || r.area === area)
      .filter((r) => kind === '전체' || isCafeCategory(r.category) === (kind === '카페'))
      .filter((r) => service === '전체' || r.tags.includes(service))
      .filter((r) => !needsOnly || needsInfo(r))
      .filter((r) => !q || [r.name, ...r.menus, r.category, ...r.tags].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => data.areas.indexOf(a.area) - data.areas.indexOf(b.area) || a.name.localeCompare(b.name, 'ko'));
  }, [data, query, area, kind, service, needsOnly]);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">내 식당</h1>
          <p className="text-sm text-stone-500">{data.restaurants.length}곳 저장됨</p>
        </div>
        <button onClick={() => setEditing({ kind: 'new', pasteFirst: false })} className="flex items-center gap-1 rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white">
          <Plus className="size-4" /> 추가
        </button>
      </header>

      <button
        onClick={() => setEditing({ kind: 'new', pasteFirst: true })}
        className="w-full rounded-2xl border-2 border-dashed border-orange-300 bg-white px-4 py-3 text-left active:bg-orange-50"
      >
        <div className="flex items-center gap-1.5 text-sm font-bold text-orange-600"><Link2 className="size-4" /> 지도 링크로 추가</div>
        <div className="mt-0.5 text-xs text-stone-500">카카오맵·네이버지도에서 공유 → 복사한 내용을 붙여넣으면 자동으로 채워져요</div>
      </button>
      {KAKAO_IMPORT_ENABLED && (
        <button
          onClick={() => setImporting(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-stone-200 bg-white py-2.5 text-sm font-semibold text-stone-600"
        >
          <Search className="size-4" /> 카카오맵에서 검색해서 가져오기
        </button>
      )}

      {notice && <p className="rounded-2xl bg-green-100 p-3 text-sm text-green-900">{notice}</p>}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름, 메뉴, 태그로 검색"
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 outline-none focus:border-orange-400"
      />
      <div className="space-y-2">
        <div className="grid grid-cols-[3fr_2fr] gap-2">
          <Segmented options={KINDS} value={kind} onChange={setKind} />
          <Segmented options={SERVICES.map((v) => ({ v, label: v }))} value={service} onChange={setService} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[ALL, ...data.areas].map((a) => (
            <div key={a} className="shrink-0"><Chip active={area === a} onClick={() => setArea(a)}>{a}</Chip></div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          {needsInfoCount > 0 ? (
            <button
              onClick={() => setNeedsOnly(!needsOnly)}
              aria-pressed={needsOnly}
              className={`rounded-full border px-2.5 py-1 font-semibold ${needsOnly ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-stone-200 bg-white text-stone-500'}`}
            >
              보충 필요만 ({needsInfoCount})
            </button>
          ) : (
            <span />
          )}
          {filtering && (
            <span className="flex items-center gap-2 text-stone-500">
              {data.restaurants.length}곳 중 <b className="text-stone-800">{list.length}곳</b>
              <button onClick={resetFilters} className="font-semibold text-orange-600 underline">초기화</button>
            </span>
          )}
        </div>
      </div>

      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {list.map((r) => {
          const last = lastVisitDate(r.id, data.visits);
          return (
            <li key={r.id}>
              <button onClick={() => setEditing({ kind: 'edit', restaurant: r })} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-stone-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{r.name}</span>
                    <StarBadge stars={r.stars} />
                    <AvgStars all={data.allStars?.[r.id]} nick={nick} />
                    {needsInfo(r) && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">보충 필요</span>}
                  </div>
                  <div className="truncate text-xs text-stone-500">
                    {r.area} · {r.category} · {r.menus.length ? r.menus.join(', ') : '메뉴 미입력'} · {priceText(r)}
                  </div>
                </div>
                {last && <span className="shrink-0 text-xs text-stone-400">{relativeDay(last, today)}</span>}
              </button>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="p-6 text-center text-sm text-stone-400">
            {data.restaurants.length === 0 ? (
              <>아직 등록한 식당이 없어요.<br />위의 <b className="text-orange-600">지도 링크로 추가</b>로 첫 식당을 넣어보세요.</>
            ) : (
              '찾는 식당이 없어요.'
            )}
          </li>
        )}
      </ul>

      {importing && (
        <KakaoImport
          data={data}
          initialArea={area !== ALL ? area : data.areas.includes(DEFAULT_AREA) ? DEFAULT_AREA : data.areas[0]}
          onSetCenter={actions.setAreaCenter}
          onClose={() => setImporting(false)}
          onAdd={(list) => {
            actions.addRestaurants(list);
            setImporting(false);
            setNeedsOnly(true);
            setNotice(`${list.length}곳을 추가했어요. 눌러서 대표 메뉴·가격·누구랑 갈지 채워주세요.`);
          }}
        />
      )}

      {editing && (
        <RestaurantForm
          key={editing.kind === 'new' ? `new-${editing.share ?? ''}` : editing.restaurant.id}
          initial={editing.kind === 'edit' ? editing.restaurant : undefined}
          pasteFirst={editing.kind === 'new' && editing.pasteFirst}
          initialShare={editing.kind === 'new' ? editing.share : undefined}
          existing={data.restaurants}
          areas={data.areas}
          allTags={allTags}
          defaultArea={area !== ALL ? area : DEFAULT_AREA}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            actions.saveRestaurant(r);
            setNotice('');
            setEditing(null);
          }}
          onDelete={
            editing.kind === 'new'
              ? undefined
              : () => {
                  const r = editing.restaurant;
                  if (confirm(nick ? `'${r.name}'을(를) 같이 쓰는 목록에서 지울까요? 모두의 목록에서 사라져요.` : `'${r.name}'을(를) 삭제할까요? 이 식당의 방문 기록도 함께 지워져요.`)) {
                    actions.deleteRestaurant(r.id);
                    setEditing(null);
                  }
                }
          }
        />
      )}
    </div>
  );
}
