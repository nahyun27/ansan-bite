/**
 * 카카오 로컬 장소 검색 프록시 (Vercel Function).
 * 프런트엔드에 REST API 키를 노출하지 않기 위해 서버에서 대신 호출한다.
 *
 * GET /api/places?query=국밥&category=FD6&x=126.83&y=37.29&radius=1000&page=1
 *  - query가 있으면 키워드 검색, 없으면 카테고리 검색(x, y, radius 필수)
 *  - 로컬 개발 시에는 vite.config.ts의 dev 미들웨어가 같은 handlePlaces를 사용한다.
 */

export interface PlaceResult {
  id: string;
  name: string;
  /** 예: "음식점 > 한식 > 해장국" */
  categoryName: string;
  phone: string;
  address: string;
  roadAddress: string;
  /** 경도 */
  x: number;
  /** 위도 */
  y: number;
  url: string;
  /** 기준 좌표로부터 거리(m). 좌표를 안 보냈으면 null */
  distance: number | null;
}

export interface PlacesResponse {
  places: PlaceResult[];
  isEnd: boolean;
  total: number;
}

interface KakaoDocument {
  id: string;
  place_name: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance: string;
}

const KAKAO_BASE = 'https://dapi.kakao.com/v2/local/search';
const ALLOWED_CATEGORIES = new Set(['', 'FD6', 'CE7']);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=300' },
  });

export async function handlePlaces(
  request: Request,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!apiKey) return json({ error: 'KAKAO_REST_API_KEY가 설정되지 않았어요.' }, 500);

  const p = new URL(request.url).searchParams;
  const query = (p.get('query') ?? '').trim().slice(0, 100);
  const category = p.get('category') ?? '';
  const x = p.get('x');
  const y = p.get('y');
  const radius = Math.min(Math.max(Number(p.get('radius') ?? 1000) || 1000, 1), 20000);
  const page = Math.min(Math.max(Number(p.get('page') ?? 1) || 1, 1), 45);

  if (!ALLOWED_CATEGORIES.has(category)) return json({ error: '지원하지 않는 카테고리예요.' }, 400);
  const hasCoords = x !== null && y !== null && Number.isFinite(Number(x)) && Number.isFinite(Number(y));
  if (!query && !(category && hasCoords)) {
    return json({ error: '검색어 또는 (카테고리 + 기준 좌표)가 필요해요.' }, 400);
  }

  const kakaoParams = new URLSearchParams({ page: String(page), size: '15', sort: 'accuracy' });
  if (query) kakaoParams.set('query', query);
  if (category) kakaoParams.set('category_group_code', category);
  if (hasCoords) {
    kakaoParams.set('x', String(Number(x)));
    kakaoParams.set('y', String(Number(y)));
    kakaoParams.set('radius', String(radius));
  }

  const endpoint = query ? 'keyword' : 'category';
  let res: Response;
  try {
    res = await fetchImpl(`${KAKAO_BASE}/${endpoint}.json?${kakaoParams}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });
  } catch {
    return json({ error: '카카오 API에 연결하지 못했어요.' }, 502);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json({ error: `카카오 API 오류 (${res.status})`, detail: detail.slice(0, 300) }, 502);
  }

  const data = (await res.json()) as { documents: KakaoDocument[]; meta: { is_end: boolean; pageable_count: number } };
  const body: PlacesResponse = {
    places: data.documents.map((d) => ({
      id: d.id,
      name: d.place_name,
      categoryName: d.category_name,
      phone: d.phone,
      address: d.address_name,
      roadAddress: d.road_address_name,
      x: Number(d.x),
      y: Number(d.y),
      url: d.place_url,
      distance: d.distance ? Number(d.distance) : null,
    })),
    isEnd: data.meta.is_end,
    total: data.meta.pageable_count,
  };
  return json(body);
}

/** Vercel Function 진입점 */
export function GET(request: Request): Promise<Response> {
  return handlePlaces(request, process.env.KAKAO_REST_API_KEY);
}
