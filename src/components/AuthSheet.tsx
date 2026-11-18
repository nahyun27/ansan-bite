import { useState } from 'react';
import { KeyRound, Loader, LockKeyhole, UserRound, X } from 'lucide-react';
import { onEnter } from '../lib/utils';
import type { AuthMode, Sync } from '../lib/useAppData';

const NICK_KEY = 'ansan-bite:last-nick';
const readLastNick = () => {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 가입·로그인 창 (아래에서 올라옴). 구경은 로그인 없이, 바꾸려고 할 때 뜬다 */
export function AuthSheet({ sync }: { sync: Sync }) {
  const lastNick = readLastNick();
  const [mode, setMode] = useState<AuthMode>(lastNick && !sync.legacyNick ? 'login' : 'signup');
  const [nick, setNick] = useState(sync.legacyNick ?? lastNick);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [oldPass, setOldPass] = useState('');
  const [needOld, setNeedOld] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const n = nick.trim();
    if (!n || n.length > 20 || n.includes('|')) return setError('닉네임은 1~20자로 정해주세요.');
    if (password.length < 4) return setError('비밀번호는 4자 이상으로 정해주세요.');
    if (mode === 'signup' && password !== password2) return setError('비밀번호 확인이 달라요.');
    if (needOld && !oldPass) return setError('예전 공유 비밀번호를 입력해 주세요.');
    setLoading(true);
    setError('');
    const err = await sync.login(mode, n, password, needOld ? oldPass : undefined);
    setLoading(false);
    if (err) {
      if (err.code === 'legacy') setNeedOld(true);
      if (err.code === 'taken') setMode('login');
      return setError(err.message);
    }
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {
      /* 무시 */
    }
  };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError('');
  };

  const input = 'w-full rounded-xl border border-stone-200 bg-white py-3 pr-3 pl-10 text-base outline-none focus:border-orange-400';
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-stone-900/40" onClick={sync.closeAuth}>
      <div
        role="dialog"
        aria-label={mode === 'signup' ? '가입하기' : '로그인'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-orange-50 px-5 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{mode === 'signup' ? '가입하고 같이 채우기' : '로그인'}</h2>
            <p className="mt-1 text-sm text-stone-500">{sync.auth?.reason ?? '식당 추가·별점·먹은 기록은 가입하면 저장돼요.'}</p>
          </div>
          <button onClick={sync.closeAuth} aria-label="닫기" className="-mt-1 -mr-1 rounded-full p-2 text-stone-400"><X className="size-5" /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-200/60 p-1">
          {(['signup', 'login'] as AuthMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`rounded-lg py-2 text-sm font-bold ${mode === m ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-500'}`}
            >
              {m === 'signup' ? '처음이에요' : '가입했어요'}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <label className="relative block">
            <UserRound className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
            <input className={input} value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)}
              onKeyDown={onEnter(submit)} placeholder="닉네임 (예: 나현)" autoComplete="username" />
          </label>
          <label className="relative block">
            <LockKeyhole className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
            <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onEnter(submit)} placeholder={mode === 'signup' ? '내 비밀번호 만들기 (4자 이상)' : '비밀번호'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
          {mode === 'signup' && (
            <label className="relative block">
              <LockKeyhole className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
              <input className={input} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={onEnter(submit)} placeholder="비밀번호 한 번 더" autoComplete="new-password" />
            </label>
          )}
          {mode === 'signup' && needOld && (
            <label className="relative block">
              <KeyRound className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400" />
              <input className={input} type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)}
                onKeyDown={onEnter(submit)} placeholder="예전 공유 비밀번호" autoComplete="off" />
            </label>
          )}
          <p className="text-xs text-stone-400">
            {mode === 'signup'
              ? '닉네임은 별점 옆에 보여요. 다른 기기에서도 같은 닉네임·비밀번호로 로그인하면 이어져요.'
              : '휴대폰·노트북에서 같은 닉네임으로 로그인하면 별점과 기록이 이어져요.'}
          </p>
          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
          <button onClick={submit} disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-orange-500 py-3.5 font-bold text-white disabled:opacity-60">
            {loading && <Loader className="size-4 animate-spin" />} {mode === 'signup' ? '가입하기' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
