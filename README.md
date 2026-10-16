# TEXTYLE Web

사진 한 장과 검색어로 비슷한 옷을 찾는 패션 검색 서비스 **TEXTYLE**의 프론트엔드입니다.
Expo(React Native)로 만들었고, 웹으로 빌드해 Vercel에 배포합니다.

- 서비스: https://tex-tyle.app

## 주요 화면

| 탭 / 화면 | 파일 | 기능 |
|---|---|---|
| 홈 | `app/(tabs)/home.tsx` | 카테고리 칩 필터, 2열 상품 목록, 20개씩 무한 스크롤 |
| 검색 | `app/(tabs)/index.tsx` | 사진 + 검색어(또는 둘 중 하나)로 AI 검색, 검색 단계 표시 |
| 북마크 | `app/(tabs)/bookmarks.tsx` | 찜 목록. 찜을 해제하면 빈 하트로 바뀌고, 새로고침하거나 탭을 옮기면 목록에서 빠짐 |
| 안내 | `app/(tabs)/guide.tsx` | 사용 방법과 검색어 예시 |
| MY | `app/(tabs)/login.tsx` | 이메일 로그인, 구글 로그인, 로그아웃 |
| 상품 상세 | `app/product.tsx` | 찜, 이 상품 사진으로 비슷한 상품 검색, 판매 페이지 이동 |
| 회원가입 | `app/signup.tsx` | 이메일 회원가입 |

## 시스템 구성

```
웹 (Expo Web, Vercel)
  └─ Spring Boot API 서버 (api.tex-tyle.app)   검색 중계 · 로그인 · 찜 · 상품 목록
       └─ FastAPI AI 검색 서버                  FashionCLIP · Gemini 기반 검색 (외부 비공개)
            └─ Supabase                         상품 데이터 · 벡터 검색(pgvector)
```

- 프론트는 Spring 서버의 API만 호출합니다.
- Supabase는 구글 로그인(Supabase Auth)에만 직접 사용합니다. 로그인 후 받은 세션으로 Spring 서버의 `/api/auth/social-login`을 호출해 서비스 토큰을 받습니다.

### 사용하는 API (Spring 서버)

| 기능 | API |
|---|---|
| 검색 | `POST /api/search` |
| 상품 목록 · 카테고리 | `GET /api/products`, `GET /api/products/categories` |
| 로그인 · 회원가입 | `POST /api/auth/login`, `POST /api/auth/join`, `POST /api/auth/social-login` |
| 찜 | `/api/bookmarks` |

## 기술 스택

- Expo SDK 54, expo-router 6 (파일 기반 라우팅)
- React 19.1, React Native 0.81, react-native-web
- TypeScript
- Supabase JS (구글 로그인)
- AsyncStorage (로그인 토큰 저장)

## 폴더 구조

```
app/
  (tabs)/        하단 탭 화면 (홈, 검색, 북마크, 안내, MY)
  product.tsx    상품 상세
  signup.tsx     회원가입
  _layout.tsx    전체 레이아웃 (구글 로그인 복귀 처리 포함)
lib/
  auth.ts        로그인 토큰 저장/삭제, 토큰을 붙여 API를 호출하는 authFetch
  authSync.ts    구글 로그인 후 Supabase 세션을 Spring 서버 토큰으로 교환
  bookmarks.ts   찜 API
  home.ts        상품 목록 · 카테고리 API
  searchPreset.ts 상품 상세 → 검색 탭으로 사진을 넘기는 일회성 저장소
  notify.ts      웹/앱 공통 알림창
supabase.ts      Supabase 클라이언트
vercel.json      Vercel 빌드 · 주소 재작성 설정
```

## 로컬 실행

1. 의존성 설치

   ```bash
   npm install
   ```

2. 프로젝트 루트에 `.env` 파일 만들기

   ```
   EXPO_PUBLIC_FASHION_API_URL=   # Spring 서버 주소 (로컬 서버면 http://localhost:8080)
   EXPO_PUBLIC_SUPABASE_URL=
   EXPO_PUBLIC_SUPABASE_ANON_KEY=
   ```

   - 실제 값은 팀 DM으로 공유합니다. `.env`는 `.gitignore`에 포함되어 있으니 커밋하지 마세요.
   - `EXPO_PUBLIC_`로 시작하는 값은 빌드할 때 앱 코드에 그대로 들어갑니다. 서버 비밀키는 절대 넣지 마세요.

3. 실행

   ```bash
   npm run web        # 웹 (http://localhost:8081)
   npx expo start     # 앱 (Expo Go, 에뮬레이터)
   ```

### 로컬에서 알아둘 점

- 구글 로그인을 로컬에서 쓰려면 Supabase의 **Authentication → URL Configuration → Redirect URLs**에 로컬 주소(예: `http://localhost:8081`)가 등록되어 있어야 합니다.
- 무신사 상품 사진은 브라우저가 직접 읽을 수 없어(CORS) 배포 환경에서는 `/img-proxy` 주소를 거쳐 받습니다. 이 주소는 Vercel 설정이라 로컬 웹에서는 동작하지 않아서, 상품 상세의 "검색하기"로 사진을 자동 첨부하는 기능이 실패할 수 있습니다.

## 배포 (Vercel)

설정은 `vercel.json`에 있습니다.

- 빌드: `expo export -p web` → 결과물 `dist`
- 주소 재작성
  - `/img-proxy/*` → `https://image.msscdn.net/*` (무신사 이미지 CORS 우회)
  - 그 밖의 모든 주소 → `/` (새로고침해도 화면이 열리도록)
- 환경변수는 Vercel 프로젝트의 **Settings → Environment Variables**에 위 `.env`와 같은 이름으로 등록합니다. `EXPO_PUBLIC_` 값은 빌드할 때 들어가므로, 값을 바꾸면 다시 배포해야 반영됩니다.

## 관련 저장소

- Spring Boot API 서버: `sunghoonhan-hh/Textile-Service`
- AI 검색 서버: `SeokHyeon02/Textyle-demo` (`Textyle-vectorserver`)
