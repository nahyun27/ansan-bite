import { useState } from 'react';
import { Copy, Download, Ellipsis, EllipsisVertical, ExternalLink, Share, Smartphone, SquarePlus, X } from 'lucide-react';
import { detectPlatform, openInExternalBrowser, useInstallPrompt, type Platform } from '../lib/install';

const DISMISS_KEY = 'ansan-bite:install-dismissed';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{n}</span>
      <span className="flex flex-wrap items-center gap-1">{children}</span>
    </li>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <b className="inline-flex items-center gap-0.5 rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-800">{children}</b>
);

/** 기기에 맞는 설치 방법 */
export function InstallSteps({ platform }: { platform: Platform }) {
  const { canPrompt, prompt } = useInstallPrompt();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      /* 무시 */
    }
  };

  if (platform === 'kakao' || platform === 'inapp') {
    return (
      <div className="space-y-2 text-sm text-stone-600">
        <p>지금은 앱 안의 브라우저라 설치가 안 돼요. <b>{/iPhone|iPad/.test(navigator.userAgent) ? 'Safari' : 'Chrome'}</b>에서 열어주세요.</p>
        {platform === 'kakao' ? (
          <button onClick={() => openInExternalBrowser()} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white">
            <ExternalLink className="size-4" /> 브라우저로 열기
          </button>
        ) : (
          <button onClick={copy} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white">
            <Copy className="size-4" /> {copied ? '링크 복사됨 — 브라우저에 붙여넣기' : '링크 복사하기'}
          </button>
        )}
      </div>
    );
  }

  if (platform === 'android' || (platform === 'desktop' && canPrompt)) {
    return canPrompt ? (
      <button onClick={() => void prompt()} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white">
        <Download className="size-4" /> 앱 설치
      </button>
    ) : (
      <ol className="space-y-1.5 text-sm text-stone-600">
        <Step n={1}>Chrome 오른쪽 위 <Key><EllipsisVertical className="size-3.5" /></Key> 누르기</Step>
        <Step n={2}><Key>앱 설치</Key> 또는 <Key>홈 화면에 추가</Key></Step>
        <Step n={3}>설치하면 지도 앱 <b>공유</b> 메뉴에 Ansan Bite가 나와요</Step>
      </ol>
    );
  }

  if (platform === 'ios-safari' || platform === 'ios-other') {
    return (
      <ol className="space-y-1.5 text-sm text-stone-600">
        {platform === 'ios-other' && <p className="pb-1 text-xs text-stone-400">Safari에서 하는 게 가장 확실해요.</p>}
        <Step n={1}>아래쪽 <Key><Share className="size-3.5" /> 공유</Key> 버튼 누르기 <span className="text-xs text-stone-400">(안 보이면 <Key><Ellipsis className="size-3.5" /></Key> 안에 있어요)</span></Step>
        <Step n={2}>목록을 내려서 <Key><SquarePlus className="size-3.5" /> 홈 화면에 추가</Key></Step>
        <Step n={3}>오른쪽 위 <Key>추가</Key> → 홈 화면의 Ansan Bite로 열기</Step>
        <p className="pt-1 text-xs text-stone-400">홈 화면 앱에서도 같은 비밀번호·닉네임으로 들어오면 목록이 그대로 보여요.</p>
      </ol>
    );
  }

  return <p className="text-sm text-stone-600">휴대폰에서 열면 홈 화면에 앱처럼 설치할 수 있어요.</p>;
}

/** 오늘 화면 맨 위: 설치 안 한 사람에게만, 닫으면 다시 안 뜸 */
export function InstallBanner() {
  const [platform] = useState(detectPlatform);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || platform === 'installed' || platform === 'desktop') return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 무시 */
    }
  };
  return (
    <section className="relative space-y-2.5 rounded-2xl border border-orange-200 bg-white p-4">
      <button onClick={close} aria-label="안내 닫기" className="absolute top-3 right-3 rounded-full p-1 text-stone-400 active:bg-stone-100">
        <X className="size-4" />
      </button>
      <p className="flex items-center gap-1.5 pr-6 text-sm font-bold">
        <Smartphone className="size-4 text-orange-500" /> 홈 화면에 앱으로 설치하면 더 편해요
      </p>
      <InstallSteps platform={platform} />
    </section>
  );
}

/** 기록 탭: 언제든 볼 수 있는 설치 안내 */
export function InstallSection() {
  const [platform] = useState(detectPlatform);
  if (platform === 'installed') return null;
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-1.5 font-bold"><Smartphone className="size-4" /> 앱으로 설치하기</h2>
      <InstallSteps platform={platform} />
    </section>
  );
}
