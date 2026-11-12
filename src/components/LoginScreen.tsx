import { useState } from 'react';
import { KeyRound, Loader, UserRound } from 'lucide-react';
import { onEnter } from '../lib/utils';

const NICK_KEY = 'ansan-bite:last-nick';

export function LoginScreen({ onLogin, message }: { onLogin: (passcode: string, nick: string) => Promise<string | null>; message?: string }) {
  const [passcode, setPasscode] = useState('');
  const [nick, setNick] = useState(() => {
    try {
      return localStorage.getItem(NICK_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [error, setError] = useState(message ?? '');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!passcode) return setError('공유 비밀번호를 입력해 주세요.');
    const n = nick.trim();
    if (!n || n.length > 20 || n.includes('|')) return setError('닉네임은 1~20자로 정해주세요.');
    setLoading(true);
    setError('');
    const err = await onLogin(passcode, n);
    setLoading(false);
    if (err) return setError(err);
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {
      /* 무시 */
    }
  };

  const input = 'w-full rounded-xl border border-stone-200 bg-white py-3 pr-3 pl-10 text-base outline-none focus:border-orange-400';
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-sm font-black tracking-wide text-orange-500">Ansan Bite</h1>
      <p className="mt-1 text-2xl font-bold">같이 쓰는 안산 맛집 목록</p>
      <p className="mt-2 text-sm text-stone-500">공유 비밀번호를 받은 사람만 들어올 수 있어요. 식당 목록은 다 같이 보고, 별점과 먹은 기록은 닉네임별로 따로 저장돼요.</p>

      <div className="mt-8 space-y-3">
        <label className="relative block">
          <KeyRound className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
          <input className={input} type="password" autoComplete="current-password" value={passcode}
            onChange={(e) => setPasscode(e.target.value)} onKeyDown={onEnter(submit)} placeholder="공유 비밀번호" />
        </label>
        <label className="relative block">
          <UserRound className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
          <input className={input} value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)}
            onKeyDown={onEnter(submit)} placeholder="닉네임 (예: 나현)" />
        </label>
        <p className="text-xs text-stone-400">내 휴대폰·노트북에서 같은 닉네임으로 들어오면 별점과 기록이 이어져요.</p>
        {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
        <button onClick={submit} disabled={loading}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-500 py-3.5 font-bold text-white disabled:opacity-60">
          {loading && <Loader className="size-4 animate-spin" />} 들어가기
        </button>
      </div>
    </div>
  );
}
