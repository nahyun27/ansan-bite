import type { PreviewResult } from '../../api/preview';

const KAKAO_HOST_RE = /^(kko\.to|kko\.kakao\.com|place\.map\.kakao\.com|m?\.?map\.kakao\.com)$/;

export function isKakaoLink(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return KAKAO_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** 카카오맵 링크의 미리보기에서 이름·주소 가져오기. 실패하면 null (조용히 무시) */
export async function fetchLinkPreview(url: string): Promise<PreviewResult | null> {
  try {
    const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as PreviewResult;
  } catch {
    return null;
  }
}
