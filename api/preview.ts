/**
 * 지도 공유 링크의 미리보기 정보(OG 태그)에서 이름·주소를 읽는다 (Vercel Function).
 * 메신저 링크 미리보기와 같은 방식. 카카오맵은 og:title=이름, og:description=주소.
 * 네이버지도는 자동 요청을 막아서(429) 지원하지 않음 → 공유 텍스트 전체를 붙여넣으면 됨.
 *
 * GET /api/preview?url=https://kko.to/xxxx
 */

export interface PreviewResult {
  name?: string;
  address?: string;
  url: string;
  kakaoId?: string;
}

/** 요청을 허용하는 호스트 (임의 주소 요청 방지) */
const ALLOWED_HOSTS = new Set(['kko.to', 'kko.kakao.com', 'place.map.kakao.com', 'map.kakao.com', 'm.map.kakao.com']);
const MAX_REDIRECTS = 4;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });

function isAllowed(u: URL): boolean {
  return (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_HOSTS.has(u.hostname);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function readMeta(html: string, property: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() || undefined : undefined;
}

export async function handlePreview(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const raw = new URL(request.url).searchParams.get('url') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return json({ error: '링크 형식이 아니에요.' }, 400);
  }
  if (!isAllowed(target)) return json({ error: '카카오맵 링크만 미리보기를 지원해요.' }, 400);

  try {
    // 리다이렉트를 직접 따라가며 매 단계 호스트 확인
    let res: Response | undefined;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      res = await fetchImpl(target.toString(), {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; AnsanBite link preview)', accept: 'text/html' },
        signal: AbortSignal.timeout(6000),
      });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        target = new URL(loc, target);
        if (!isAllowed(target)) return json({ error: '지원하지 않는 곳으로 연결되는 링크예요.' }, 400);
        continue;
      }
      break;
    }
    if (!res || !res.ok) return json({ error: `링크를 열지 못했어요 (${res?.status ?? '?'})` }, 502);

    const html = (await res.text()).slice(0, 200_000);
    const body: PreviewResult = {
      name: readMeta(html, 'og:title'),
      address: readMeta(html, 'og:description'),
      url: target.toString(),
      kakaoId: target.hostname === 'place.map.kakao.com' ? target.pathname.match(/(\d+)/)?.[1] : undefined,
    };
    return json(body);
  } catch {
    return json({ error: '링크 정보를 가져오지 못했어요.' }, 502);
  }
}

export function GET(request: Request): Promise<Response> {
  return handlePreview(request);
}
