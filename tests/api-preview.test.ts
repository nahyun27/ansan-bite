import { describe, expect, it, vi } from 'vitest';
import { handlePreview, readMeta } from '../api/preview';

const req = (u: string) => new Request(`http://localhost/api/preview?url=${encodeURIComponent(u)}`);
const page = '<html><head><meta property="og:title" content="중앙해장"><meta property="og:description" content="서울 강남구 영동대로86길 17 &amp; 1층"></head></html>';

describe('handlePreview', () => {
  it('카카오 짧은 링크 → 리다이렉트 따라가서 이름·주소', async () => {
    const f = vi.fn(async (u: string) =>
      u.startsWith('https://kko.to/')
        ? new Response(null, { status: 302, headers: { location: 'https://place.map.kakao.com/27531028' } })
        : new Response(page, { status: 200 }),
    );
    const res = await handlePreview(req('https://kko.to/AbC'), f as unknown as typeof fetch);
    expect(await res.json()).toEqual({
      name: '중앙해장', address: '서울 강남구 영동대로86길 17 & 1층',
      url: 'https://place.map.kakao.com/27531028', kakaoId: '27531028',
    });
  });

  it('허용하지 않은 주소는 요청하지 않음', async () => {
    const f = vi.fn();
    expect((await handlePreview(req('http://169.254.169.254/latest'), f as unknown as typeof fetch)).status).toBe(400);
    expect((await handlePreview(req('https://naver.me/abc'), f as unknown as typeof fetch)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('허용 주소에서 다른 곳으로 리다이렉트되면 중단', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://localhost:3000/admin' } }));
    expect((await handlePreview(req('https://kko.to/x'), f as unknown as typeof fetch)).status).toBe(400);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('readMeta: 속성 순서가 달라도 읽음', () => {
    expect(readMeta('<meta content="이름" property="og:title">', 'og:title')).toBe('이름');
  });
});
