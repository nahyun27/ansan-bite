# Ansan Bite 🍚

> 오늘은 어디서 먹지? 지금 상황에 맞는 안산 맛집 3곳을 골라드려요.

내가 아는 식당을 모아두고, 지역·동행·예산 조건에 맞춰 3곳을 추천해 주는 개인용 모바일 웹앱(PWA).

## 실행
```bash
npm install
npm run dev        # 개발 서버 (휴대폰 테스트: npm run dev -- --host)
npm test           # 추천 로직 단위 테스트
npm run build      # 배포용 빌드 → dist/
```

## 식당 추가하기 (기본: 지도 링크 붙여넣기)
1. 카카오맵·네이버지도 앱에서 식당 열기 → **공유 → 복사**
2. Ansan Bite **내 식당 → 🔗 지도 링크로 추가** → 붙여넣기
3. 이름·지도 링크·주소(·전화번호)가 자동으로 채워지고, **음식 종류·대표 메뉴는 이름으로 추측** (예: '마라공방' → 중식·마라탕)
4. 바로 저장해도 되고, 메뉴·가격은 나중에 채우면 됨 ('보충 필요' 표시)

- 네이버지도: 공유 텍스트 전체를 붙여넣기 (링크만 있으면 이름은 직접 입력 → 입력하는 순간 분류 추측)
- 카카오맵: 링크만 붙여넣어도 미리보기(`/api/preview`)에서 이름·주소를 가져옴

안드로이드에서 홈 화면에 설치(PWA)하면 지도 앱 공유 메뉴에 **Ansan Bite**가 바로 나타남(Share Target).
아이폰은 Share Target을 지원하지 않아 붙여넣기로 사용.

## (선택) 카카오 장소 검색으로 가져오기
카카오맵 API 사용 설정 시 결제 카드 등록이 필요해서 **기본으로 꺼둠**. 켜려면 아래 설정 + `.env.local`에 `VITE_ENABLE_KAKAO_IMPORT=true`.

1. [Kakao Developers](https://developers.kakao.com)에서 앱 생성 → **REST API 키** 복사
2. 앱 설정에서 **카카오맵 API 사용 설정**이 꺼져 있으면 켜기 (꺼져 있으면 403 오류)
3. 로컬: `cp .env.example .env.local` 후 `KAKAO_REST_API_KEY` 입력 → `npm run dev`
4. 배포(Vercel): 프로젝트 환경 변수에 `KAKAO_REST_API_KEY` 등록

키는 서버(`api/places.ts`, Vercel Function)에서만 쓰이고 브라우저로는 전달되지 않음.
로컬에서는 Vite 미들웨어가 같은 핸들러를 실행함.

## 구조
- `src/lib/recommend.ts` — 걸러내기 + 점수 계산 (가중치는 `WEIGHTS`에서 조정)
- `api/places.ts` — 카카오 로컬 API 프록시 (Vercel Function)
- `src/lib/shareParse.ts` — 지도 앱 공유 텍스트 해석
- `src/lib/guessCategory.ts` — 이름으로 음식 종류·메뉴 추측 (규칙 추가는 여기)
- `api/preview.ts` — 카카오맵 링크 미리보기 (카카오 주소만 허용)
- `src/lib/places.ts` — 검색 결과 → 내 식당 변환 (분류 매핑, 도보 태그)
- `src/lib/storage.ts` — localStorage 저장, 백업 파일 검증
- `src/data/defaults.ts` — 기본 지역·태그·분류 (식당은 앱에서 직접 등록)
- `src/pages/` — 오늘 / 내 식당 / 기록 화면

## 추천 점수
| 항목 | 점수 |
|---|---|
| 또 갈래 / 무난해 / 안 가봄 | +30 / +10 / +15 |
| 마지막 방문 3일 이내 / 7일 이내 / 14일 초과 | −40 / −20 / +10 |
| 최근 2끼와 같은 음식 종류 | −15 |
| 선택한 태그 일치 | 태그당 +10 |
| 랜덤 | 0~10 (추천받기·다른 곳 추천을 누를 때만 새로 생성) |

`내 취향 아님` 평가는 추천에서 제외. 식당의 현재 평가는 평가가 있는 가장 최근 방문 기록에서 계산.
