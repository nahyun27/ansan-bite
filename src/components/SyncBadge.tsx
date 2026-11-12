import { CloudAlert, CloudOff } from 'lucide-react';
import type { Sync } from '../lib/useAppData';

/** 오프라인·저장 오류일 때만 하단 탭 위에 작게 표시 (평소 상태는 기록 탭 '같이 쓰기'에서) */
export function SyncBadge({ sync, onClick }: { sync: Sync; onClick: () => void }) {
  const { status, pendingCount } = sync;
  if (status !== 'offline' && status !== 'error') return null;
  const offline = status === 'offline';
  const Icon = offline ? CloudOff : CloudAlert;
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-md ${
        offline ? 'bg-stone-700' : 'bg-red-500'
      }`}
      aria-label={`동기화: ${offline ? '오프라인' : '저장 오류'}`}
    >
      <Icon className="size-3.5" />
      {offline ? `오프라인${pendingCount ? ` · ${pendingCount}개는 연결되면 저장돼요` : ''}` : '저장 오류 · 눌러서 확인'}
    </button>
  );
}
