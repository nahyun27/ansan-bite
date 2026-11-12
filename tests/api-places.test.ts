import { describe, expect, it, vi } from 'vitest';
import { handlePlaces } from '../api/places';

const kakaoBody = {
  documents: [
    {
      id: '123', place_name: '든든국밥 본점', category_name: '음식점 > 한식 > 해장국', phone: '031-000-0000',
      address_name: '경기 안산시 상록구 사동 1', road_address_name: '경기 안산시 상록구 한양대학로 1',
      x: '126.835', y: '37.297', place_url: 'http://place.map.kakao.com/123', distance: '350',
    },
  ],
  meta: { is_end: true, pageable_count: 1 },
};
const okFetch = () => vi.fn(async () => new Response(JSON.stringify(kakaoBody), { status: 200 }));
const req = (qs: string) => new Request(`http://localhost/api/places?${qs}`);

describe('handlePlaces', () => {
  it('키가 없으면 500', async () => {
    expect((await handlePlaces(req('query=국밥'), undefined)).status).toBe(500);
  });

  it('검색어가 있으면 키워드 검색 + 키를 헤더로 전달', async () => {
    const f = okFetch();
    const res = await handlePlaces(req('query=국밥&category=FD6&x=126.8&y=37.3&radius=99999'), 'KEY', f);
    expect(res.status).toBe(200);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/keyword.json?');
    expect(url).toContain('category_group_code=FD6');
    expect(url).toContain('radius=20000'); // 최대값으로 제한
    expect((init.headers as Record<string, string>).Authorization).toBe('KakaoAK KEY');
    const body = await res.json();
    expect(body.places[0]).toMatchObject({ id: '123', name: '든든국밥 본점', x: 126.835, y: 37.297, distance: 350 });
  });

  it('검색어가 없으면 카테고리 검색 (좌표 필수)', async () => {
    const f = okFetch();
    await handlePlaces(req('category=FD6&x=126.8&y=37.3'), 'KEY', f);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('/category.json?');
    expect((await handlePlaces(req('category=FD6'), 'KEY', f)).status).toBe(400);
  });

  it('허용하지 않은 카테고리는 400', async () => {
    expect((await handlePlaces(req('query=a&category=XX'), 'KEY', okFetch())).status).toBe(400);
  });

  it('카카오 오류는 502로 전달', async () => {
    const f = vi.fn(async () => new Response('{"message":"disabled"}', { status: 403 }));
    const res = await handlePlaces(req('query=국밥'), 'KEY', f);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('403');
  });
});
