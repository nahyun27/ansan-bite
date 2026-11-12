import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AppData } from '../types';
import type { Actions } from '../lib/useAppData';
import { exportFileName, normalizeData, parseAppData } from '../lib/storage';
import { formatPrice, relativeDay, sortVisitsDesc, toDateStr } from '../lib/utils';
import { StarRating } from '../components/StarRating';

export function HistoryPage({ data, actions }: { data: AppData; actions: Actions }) {
  const today = toDateStr();
  const month = today.slice(0, 7);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [newArea, setNewArea] = useState('');

  const byId = useMemo(() => new Map(data.restaurants.map((r) => [r.id, r])), [data.restaurants]);
  const visits = useMemo(() => sortVisitsDesc(data.visits), [data.visits]);

  const stats = useMemo(() => {
    const thisMonth = data.visits.filter((v) => v.date.startsWith(month));
    const cat = new Map<string, number>();
    let spent = 0;
    let priced = 0;
    for (const v of thisMonth) {
      const r = byId.get(v.restaurantId);
      if (!r) continue;
      cat.set(r.category, (cat.get(r.category) ?? 0) + 1);
      if (r.price !== undefined) {
        spent += r.price;
        priced += 1;
      }
    }
    const top = [...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { count: thisMonth.length, top, avg: priced ? spent / priced : 0 };
  }, [data.visits, byId, month]);

  const onExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(today);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = async (file: File) => {
    const parsed = parseAppData(await file.text());
    if (!parsed) return setMessage('Ansan Bite 백업 파일이 아니거나 형식이 깨졌어요.');
    if (confirm(`식당 ${parsed.restaurants.length}곳, 기록 ${parsed.visits.length}개로 지금 데이터를 바꿀까요?`)) {
      actions.replaceData(normalizeData(parsed));
      setMessage('백업을 불러왔어요.');
    }
  };

  // 날짜별 묶음
  const groups: [string, typeof visits][] = [];
  for (const v of visits) {
    const last = groups[groups.length - 1];
    if (last && last[0] === v.date) last[1].push(v);
    else groups.push([v.date, [v]]);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">기록</h1>
      </header>

      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat label="이번 달" value={`${stats.count}끼`} />
        <Stat label="많이 먹은" value={stats.top[0]?.[0] ?? '-'} />
        <Stat label="평균" value={stats.avg ? formatPrice(stats.avg).replace('약 ', '') : '-'} />
      </section>

      <section className="space-y-3">
        {groups.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400">
            아직 기록이 없어요.<br />오늘 탭에서 <b>여기 먹을래</b>를 누르면 기록돼요.
          </p>
        )}
        {groups.map(([date, vs]) => (
          <div key={date}>
            <div className="mb-1 text-xs font-semibold text-stone-400">
              {date} · {relativeDay(date, today)}
            </div>
            <ul className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm">
              {vs.map((v) => {
                const r = byId.get(v.restaurantId);
                return (
                  <li key={v.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{r?.name ?? '삭제된 식당'}</span>
                        {r && <span className="ml-1.5 text-xs text-stone-400">{r.category} · {r.area}</span>}
                      </div>
                      <button
                        onClick={() => confirm('이 기록을 지울까요?') && actions.deleteVisit(v.id)}
                        className="px-1 text-stone-300"
                        aria-label="기록 삭제"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <StarRating size="sm" value={v.stars} onChange={(s) => actions.rateVisit(v.id, s)} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">지역 관리</h2>
        <div className="flex flex-wrap gap-2">
          {data.areas.map((a) => {
            const used = data.restaurants.filter((r) => r.area === a).length;
            return (
              <span key={a} className="flex items-center gap-1 rounded-full bg-stone-100 py-1 pr-1.5 pl-3 text-sm">
                {a} <span className="text-xs text-stone-400">{used}</span>
                {used === 0 && (
                  <button onClick={() => actions.removeArea(a)} className="px-1 text-stone-400" aria-label={`${a} 삭제`}><X className="size-3.5" /></button>
                )}
              </span>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            placeholder="새 지역 (예: 한대앞역)"
            className="w-full rounded-xl border border-stone-200 px-3 py-2 outline-none focus:border-orange-400"
          />
          <button
            onClick={() => { actions.addArea(newArea); setNewArea(''); }}
            className="shrink-0 rounded-xl bg-stone-200 px-3 text-sm font-medium"
          >
            추가
          </button>
        </div>
        <p className="text-xs text-stone-400">식당이 없는 지역만 지울 수 있어요.</p>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">백업</h2>
        <p className="text-xs text-stone-500">데이터는 이 기기 브라우저에만 저장돼요. 가끔 백업 파일로 내보내 두세요.</p>
        <div className="flex gap-2">
          <button onClick={onExport} className="flex-1 rounded-xl bg-stone-800 py-2.5 text-sm font-semibold text-white">내보내기</button>
          <button onClick={() => fileRef.current?.click()} className="flex-1 rounded-xl border border-stone-300 py-2.5 text-sm font-semibold">
            불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && <p className="text-sm">{message}</p>}
        <button
          onClick={() => confirm('모든 식당과 기록을 지울까요? 되돌릴 수 없어요. 먼저 내보내기로 백업해 두세요.') && actions.resetAll()}
          className="w-full pt-2 text-xs text-red-400"
        >
          모든 데이터 지우기
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3 shadow-sm">
      <div className="text-xs text-stone-400">{label}</div>
      <div className="mt-0.5 truncate font-bold">{value}</div>
    </div>
  );
}
