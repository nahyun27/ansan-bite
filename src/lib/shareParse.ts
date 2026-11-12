/**
 * 지도 앱의 [공유 → 복사] 텍스트에서 식당 정보를 뽑아낸다.
 * 앱 버전마다 형식이 조금씩 달라서 줄 단위로 느슨하게 해석한다.
 *
 * 예) [네이버 지도]\n든든국밥\n경기 안산시 상록구 한양대학로 1\nhttps://naver.me/xxxx
 *     [카카오맵] 든든국밥\n경기 안산시 상록구 ...\nhttps://kko.to/xxxx
 */

export type MapSource = '카카오맵' | '네이버지도' | '링크';

export interface ParsedShare {
  name: string;
  url?: string;
  address?: string;
  phone?: string;
  source: MapSource;
  /** place.map.kakao.com/{id} 형태일 때만 */
  kakaoId?: string;
}

const URL_RE = /https?:\/\/[^\s<>"'\])]+/i;
const PHONE_RE = /^(?:tel[:.]?\s*)?(0\d{1,3}[-.\s]?\d{3,4}[-.\s]?\d{4}|1\d{3}-\d{4})$/i;
const ADDRESS_RE =
  /^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주|안산)|(시|구|군)\s.*(로|길|동|읍|면|리)\s*\d/;
const SOURCE_TAG_RE = /^[\[【(]?\s*(카카오\s?맵|kakao\s?map|네이버\s?지도|naver\s?map)\s*[\]】)]?\s*[:：-]?\s*/i;
const LABEL_RE = /^(장소명|상호명?|이름|주소|도로명주소|지번|전화(번호)?|위치)\s*[:：]\s*/;

function detectSource(text: string, url?: string): MapSource {
  const hay = `${url ?? ''} ${text}`.toLowerCase();
  if (/kko\.to|kko\.kakao|kakao\.com|카카오\s?맵/.test(hay)) return '카카오맵';
  if (/naver\.me|naver\.com|네이버\s?지도/.test(hay)) return '네이버지도';
  return '링크';
}

export function parseShare(raw: string): ParsedShare | null {
  const text = raw.trim();
  if (!text) return null;

  const url = text.match(URL_RE)?.[0];
  const source = detectSource(text, url);
  const kakaoId = url?.match(/place\.map\.kakao\.com\/(?:m\/)?(\d+)/)?.[1];

  let name = '';
  let address: string | undefined;
  let phone: string | undefined;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(URL_RE, '').replace(SOURCE_TAG_RE, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    const isAddressLabel = /^(주소|도로명주소|지번|위치)\s*[:：]/.test(line);
    const value = line.replace(LABEL_RE, '').trim();
    if (!value) continue;
    if (PHONE_RE.test(value)) {
      phone ??= value.replace(/^tel[:.]?\s*/i, '');
    } else if (isAddressLabel || ADDRESS_RE.test(value)) {
      address ??= value;
    } else if (!name) {
      name = value;
    }
  }

  if (!url && !name) return null;
  return { name: name.slice(0, 60), url, address, phone, source, kakaoId };
}

/** 주소에 지역 이름(예: '고잔동')이 들어 있으면 그 지역으로 추측 */
export function guessArea(address: string | undefined, areas: string[]): string | undefined {
  if (!address) return undefined;
  return areas.find((a) => address.includes(a));
}
