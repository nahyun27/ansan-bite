import { useCallback, useState } from 'react';
import { BookMarked, CalendarDays, FerrisWheel, Utensils, type LucideIcon } from 'lucide-react';
import { WheelPage } from './pages/Wheel';
import type { WheelCandidate } from './lib/wheel';
import { useAppData } from './lib/useAppData';
import { TodayPage } from './pages/Today';
import { RestaurantsPage } from './pages/Restaurants';
import { HistoryPage } from './pages/History';

type Tab = 'today' | 'wheel' | 'list' | 'history';
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'today', label: '오늘', Icon: Utensils },
  { id: 'wheel', label: '돌림판', Icon: FerrisWheel },
  { id: 'list', label: '내 식당', Icon: BookMarked },
  { id: 'history', label: '기록', Icon: CalendarDays },
];

/** 안드로이드 PWA 공유(share_target)로 열렸을 때 ?title=&text=&url= 을 읽는다 */
function readShareParams(): string | undefined {
  const p = new URLSearchParams(window.location.search);
  const parts = ['title', 'text', 'url'].map((k) => p.get(k)?.trim()).filter((v): v is string => !!v);
  if (parts.length === 0) return undefined;
  window.history.replaceState(null, '', window.location.pathname);
  return [...new Set(parts)].join('\n');
}

export default function App() {
  const { data, actions } = useAppData();
  const [incomingShare, setIncomingShare] = useState(readShareParams);
  const [tab, setTab] = useState<Tab>(incomingShare ? 'list' : 'today');
  const clearShare = useCallback(() => setIncomingShare(undefined), []);
  const [wheel, setWheel] = useState<WheelCandidate[]>([]);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <main className="flex-1 px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-28">
        {/* 탭 전환해도 상태(추천 결과 등)가 유지되도록 모두 마운트해 두고 숨김 처리 */}
        <div hidden={tab !== 'today'}><TodayPage
            data={data}
            actions={actions}
            onAddRestaurant={() => setTab('list')}
            onSendToWheel={(c) => {
              setWheel(c);
              setTab('wheel');
              window.scrollTo(0, 0);
            }}
          />
        </div>
        <div hidden={tab !== 'wheel'}>
          <WheelPage data={data} actions={actions} candidates={wheel} setCandidates={setWheel} /></div>
        <div hidden={tab !== 'list'}><RestaurantsPage data={data} actions={actions} incomingShare={incomingShare} onShareConsumed={clearShare} /></div>
        <div hidden={tab !== 'history'}><HistoryPage data={data} actions={actions} /></div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                tab === t.id ? 'font-bold text-orange-600' : 'text-stone-500'
              }`}
            >
              <t.Icon className="size-5" strokeWidth={tab === t.id ? 2.5 : 2} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
