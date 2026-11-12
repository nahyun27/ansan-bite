/** 홈 화면 설치(PWA) 안내용: 어떤 환경에서 열었는지 판별 + 안드로이드 설치 이벤트 보관 */
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// 안드로이드 Chrome은 이 이벤트가 앱이 그려지기 전에 올 수 있어서 모듈을 불러올 때 바로 받아둠
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export type Platform =
  | 'installed' // 이미 홈 화면 앱으로 열림
  | 'ios-safari'
  | 'ios-other' // 아이폰 크롬 등 (iOS 16.4+ 크롬도 공유 메뉴로 추가 가능)
  | 'android'
  | 'kakao' // 카카오톡 인앱 브라우저
  | 'inapp' // 인스타·페북·네이버 등 인앱 브라우저
  | 'desktop';

export function detectPlatform(ua = navigator.userAgent): Platform {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'installed';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|everytimeApp|DaumApps/i.test(ua)) return 'inapp';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** 카카오톡 인앱 브라우저에서 기본 브라우저(사파리·크롬)로 열기 */
export function openInExternalBrowser(url = window.location.href) {
  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

/** 안드로이드 Chrome의 '앱 설치' 창을 띄울 수 있는지 + 띄우기 */
export function useInstallPrompt() {
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  useEffect(() => {
    const update = () => setCanPrompt(!!deferred);
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  const prompt = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    setCanPrompt(false);
    return outcome === 'accepted';
  };
  return { canPrompt, prompt };
}
