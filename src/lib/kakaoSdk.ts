/**
 * 카카오 지도 JavaScript SDK (지도 + 장소/주소 검색).
 * 키: VITE_KAKAO_JS_KEY (Kakao Developers의 JavaScript 키, 브라우저에 공개되는 키 → 대신 사이트 도메인을 등록해 보호)
 * 키가 없으면 앱은 무료 지도(OpenStreetMap)로 동작한다.
 */

export const KAKAO_JS_KEY = (import.meta.env.VITE_KAKAO_JS_KEY as string | undefined)?.trim() || undefined;

export interface KakaoPlace {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code?: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance?: string;
}

export interface KLatLng {
  getLat(): number;
  getLng(): number;
}
export interface KMap {
  setBounds(b: KBounds, top?: number, right?: number, bottom?: number, left?: number): void;
  setCenter(p: KLatLng): void;
  setLevel(level: number): void;
  relayout(): void;
}
export interface KBounds {
  extend(p: KLatLng): void;
}
export interface KOverlay {
  setMap(m: KMap | null): void;
}
type Status = 'OK' | 'ZERO_RESULT' | 'ERROR';
export interface KPagination {
  hasNextPage: boolean;
  totalCount: number;
}

export interface KakaoNS {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => KLatLng;
    LatLngBounds: new () => KBounds;
    Map: new (el: HTMLElement, opts: { center: KLatLng; level: number }) => KMap;
    CustomOverlay: new (opts: { position: KLatLng; content: HTMLElement; xAnchor?: number; yAnchor?: number; zIndex?: number; clickable?: boolean }) => KOverlay;
    ZoomControl: new () => unknown;
    ControlPosition: { RIGHT: unknown };
    event: { addListener(target: unknown, type: string, cb: (e: { latLng: KLatLng }) => void): void };
    services: {
      Status: Record<Status, Status>;
      Places: new () => {
        keywordSearch(q: string, cb: (data: KakaoPlace[], status: Status, p: KPagination) => void, opts?: Record<string, unknown>): void;
        categorySearch(code: string, cb: (data: KakaoPlace[], status: Status, p: KPagination) => void, opts?: Record<string, unknown>): void;
      };
      Geocoder: new () => {
        addressSearch(addr: string, cb: (data: { x: string; y: string; address_name: string }[], status: Status) => void): void;
      };
    };
  };
}

declare global {
  interface Window {
    kakao?: KakaoNS;
  }
}

let loading: Promise<KakaoNS> | null = null;

/** SDK 한 번만 불러오기 */
export function loadKakao(): Promise<KakaoNS> {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error('카카오 지도 키가 설정되지 않았어요.'));
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao);
  loading ??= new Promise<KakaoNS>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_JS_KEY)}&autoload=false&libraries=services`;
    s.async = true;
    s.onload = () => {
      if (!window.kakao?.maps) {
        loading = null;
        return reject(new Error('카카오 지도를 불러오지 못했어요. 키·도메인 설정을 확인해 주세요.'));
      }
      window.kakao.maps.load(() => resolve(window.kakao!));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('카카오 지도를 불러오지 못했어요. 키·도메인 설정을 확인해 주세요.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** 콜백 방식 검색을 Promise로 */
export function keywordSearch(kakao: KakaoNS, q: string, opts?: Record<string, unknown>) {
  return new Promise<{ places: KakaoPlace[]; hasNext: boolean }>((resolve, reject) => {
    new kakao.maps.services.Places().keywordSearch(
      q,
      (data, status, p) => {
        if (status === 'ERROR') return reject(new Error('카카오 장소 검색 오류'));
        resolve({ places: status === 'OK' ? data : [], hasNext: !!p?.hasNextPage });
      },
      opts,
    );
  });
}

export function categorySearch(kakao: KakaoNS, code: string, opts?: Record<string, unknown>) {
  return new Promise<{ places: KakaoPlace[]; hasNext: boolean }>((resolve, reject) => {
    new kakao.maps.services.Places().categorySearch(
      code,
      (data, status, p) => {
        if (status === 'ERROR') return reject(new Error('카카오 장소 검색 오류'));
        resolve({ places: status === 'OK' ? data : [], hasNext: !!p?.hasNextPage });
      },
      opts,
    );
  });
}

export function addressSearch(kakao: KakaoNS, address: string) {
  return new Promise<{ x: number; y: number } | null>((resolve, reject) => {
    new kakao.maps.services.Geocoder().addressSearch(address, (data, status) => {
      if (status === 'ERROR') return reject(new Error('카카오 주소 검색 오류'));
      resolve(status === 'OK' && data[0] ? { x: Number(data[0].x), y: Number(data[0].y) } : null);
    });
  });
}
