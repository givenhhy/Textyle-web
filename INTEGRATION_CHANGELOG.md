# Textyle-web 프론트엔드 코드 수정 및 개선 내역 총정리

본 문서는 프론트엔드 웹/앱(`Textyle-web`)에 적용된 주요 버그 픽스, 보안 및 사용자 경험(UX) 개선, 백엔드(`Textile-Service-feature-routing`)와의 통신 정합성 수정 사항을 기록합니다. 향후 유지보수, 팀원 공유 및 졸업전시회 디펜스 자료로 활용할 수 있습니다.

---

## 📱 프론트엔드 (React Native / Expo Web) 수정 사항

### 1. 응답 스트림 중복 소비 버그 픽스 (Response Stream Already Read)
* **파일:** `app/signup.tsx`
* **변경 전:** 
  `await response.text()`를 실행하여 본문 스트림을 이미 소비한 상태에서 다시 `await response.json()`을 호출함.
* **문제점:**
  `TypeError: Already read` (ReadableStream이 이미 닫힘) 예외가 발생하여 `catch` 블록으로 이동, 백엔드가 반환한 정확한 에러 사유(예: "이미 존재하는 이메일입니다", "비밀번호 형식 불일치")를 파싱하지 못하고 무조건 `"네트워크 오류가 발생했습니다. 서버와 통신할 수 없습니다."`라는 오해의 소지가 있는 경고창이 출력됨.
* **변경 내용:**
  `const responseText = await response.text();`로 한 번만 안전하게 읽은 후, `JSON.parse(responseText)`를 통해 데이터를 파싱하여 백엔드 에러 메시지(`responseData.error` / `responseData.message`)를 사용자에게 정확히 전달하도록 수정.

---

### 2. 회원가입 폼 유효성 검사 순서 및 무한 로딩 인디케이터 고착 해결
* **파일:** `app/signup.tsx`
* **문제점:**
  `setLoading(true)`가 실행된 이후 유효성 검사(빈 필드, 비밀번호 불일치 등)가 실패하면 `return`되면서 `setLoading(false)`가 호출되지 않아 "가입하기" 버튼이 무한 로딩 스피너 상태로 굳어버림. 또한 네트워크 통신 중 예외가 발생할 때도 로딩 상태가 풀리지 않을 위험이 존재함.
* **변경 내용:**
  1. 필수 입력값 체크 및 비밀번호 일치 확인 로직을 `setLoading(true)` 호출 **이전**으로 전진 배치하여 불필요한 로딩 상태 진입 차단.
  2. API 통신 전체를 `try ... finally { setLoading(false); }` 구문으로 감싸 통신 성공/실패/예외 발생 여부와 무관하게 로딩 상태가 반드시 정상 해제되도록 보장.

---

### 3. 비밀번호 가림/보기 눈동자 아이콘 토글 기능 신설 (UX 개선)
* **파일 1:** `app/signup.tsx` (비밀번호 및 비밀번호 확인 입력창)
* **파일 2:** `app/(tabs)/login.tsx` (비밀번호 입력창)
* **도입 배경:**
  백엔드 보안 정책상 비밀번호 복합 규칙(8자 이상, 영문/숫자/특수문자 포함)이 적용되어 있어, 모바일이나 웹에서 긴 비밀번호를 오타 없이 입력하기 어렵고 비밀번호 확인 불일치 오류가 자주 발생함.
* **변경 내용:**
  `@expo/vector-icons`의 `Ionicons`(`eye-outline` / `eye-off-outline`)를 적용하여 비밀번호 입력창 우측에 원터치 토글 버튼을 추가하고 `secureTextEntry={!showPassword}` 상태를 연동함.

---

### 4. 이메일 대소문자 소문자화(`toLowerCase()`) 통일 (PostgreSQL 데이터 무결성 보장)
* **파일 1:** `app/signup.tsx` (`handleSignUp`)
* **파일 2:** `app/(tabs)/login.tsx` (`signInWithEmail`)
* **도입 배경:**
  스마트폰 키보드는 첫 글자 자동 대문자 변환(Auto-capitalization)이 기본 활성화되어 있어, 사용자가 의도치 않게 `User@test.com`으로 회원가입을 진행할 수 있음. 백엔드의 PostgreSQL 및 JPA 쿼리(`findByEmail`)는 대소문자를 엄격히 구분(Case-sensitive)하므로, 추후 소문자 `user@test.com`으로 로그인 시도시 계정을 찾을 수 없는 문제가 발생함.
* **변경 내용:**
  회원가입 및 로그인 요청 페이로드 생성 시 `email.trim().toLowerCase()`를 적용하여 모든 계정 이메일을 소문자로 표준화하여 서버로 전송.

---

### 5. 비밀번호 플레이스홀더 안내 문구 명확화
* **파일:** `app/signup.tsx`
* **변경 전:** `placeholder="비밀번호 (6자리 이상)"`
* **변경 후:** `placeholder="비밀번호 (8자 이상, 영문/숫자/특수문자 포함)"`
* **도입 배경:**
  프론트엔드 안내 문구는 6자리로 표시되어 있었으나, 백엔드 스프링 부트 `JoinRequest.java`의 정규식 검증 규칙(`^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{8,}$`)은 8자 이상 및 특수문자 필수를 요구하고 있어 유효성 검사 탈락 원인이 불투명했던 문제를 해소함.

### 6. 구글 연동 로그인/회원가입 기능 신설 (Google OAuth 2.0 via Supabase)
* **파일 1:** `supabase.ts`
  - `detectSessionInUrl: typeof window !== 'undefined'`로 변경하여 웹 브라우저 리다이렉트 시 주소창 해시(`#access_token=...`)의 OAuth 세션을 자동 파싱하도록 개선.
* **파일 2:** `app/(tabs)/login.tsx`
  - 게스트 화면 및 이메일 로그인 화면에 `[ Google로 계속하기 ]` 버튼 배치.
  - **로그인 진행 상태 UX 피드백(Loading Indicator) 추가:** 
    - Google 버튼 클릭 시 `"Google 로그인 창으로 이동 중..."` 인디케이터 즉시 표시.
    - Google 인증 완료 후 토큰/코드 교환 및 DB 동기화 시간(약 1~2초) 동안 전체 화면에 **"로그인 처리 중입니다 (계정 정보를 확인하고 있습니다. 잠시만 기다려주세요)"** 로딩 화면을 표시하여 화면 멈춤/미반영 오해 방지.
    - 일반 이메일 로그인 버튼 클릭 시에도 `"로그인 중..."` 스피너 및 비활성화 적용.
  - 구글 인증 후 토큰 및 프로필을 수신하여 닉네임 자동 추출 (`구글 실명` -> `이메일 아이디` -> `'textyle-user'`).
  - 백엔드 소셜 동기화 API (`POST /api/auth/social-login`) 호출 및 로컬 세션(`AsyncStorage`) 저장.
  - 로그인 후 브라우저 URL의 지저분한 토큰 해시 파라미터 자동 정리 (`history.replaceState`).
* **파일 3:** `app/signup.tsx`
  - 회원가입 화면에도 `[ Google로 계속하기 ]` 버튼을 배치하여 1초 만에 회원가입과 로그인이 동시에 완료되도록 지원.
  - 구글 버튼 클릭 및 이메일 가입 진행 시 로딩 인디케이터 표시.
* **파일 4:** `lib/authSync.ts`
  - PKCE 코드 교환 및 세션 동기화 완료 후 브라우저 히스토리(`replaceState`) 정리로 중복 재검증 방지.
* **DB 트리거 정합성 보완:**
  - Supabase `public.users`의 `nickname NOT NULL` 제약조건과 Google OAuth(닉네임 미제공) 간의 충돌 해결.
  - 트리거 함수 `handle_new_user()`에 `COALESCE` 폴백을 적용하여 DB 무결성을 유지하면서 구글 계정이 자동 등록되도록 보완 *(※ 세부 SQL 쿼리 및 트리거 DDL 전문은 백엔드 저장소의 [INTEGRATION_CHANGELOG.md](../../Textile-Service-feature-routing-edit/Textile-Service-feature-routing-edit/INTEGRATION_CHANGELOG.md)에 단독 기록되어 있습니다)*.
* **💡 아키텍처 결정 배경 (ADR: 기존 제외 및 재도입 사유):**
  1. **기존에 구글 로그인을 제외(보류)했던 이유:**
     - **모바일 네이티브(Expo Go) 환경의 기술적 제약:** 초기 모바일 앱 중심 개발 시 커스텀 딥링크 스키마(`textyle://`), 인앱 브라우저 처리, Expo Go 클라이언트 버전별 OAuth 리다이렉트 충돌 등 네이티브 단의 기술적 복잡도가 높았음.
     - **백엔드 DB(`users` 테이블)와 Supabase 간의 정합성 문제:** 스프링 부트 자체 DB(`Member` 엔티티)에 유저가 동기화되지 않은 채 Supabase만 단독 로그인될 경우, 회원 종속 API 호출 시 500 에러(회원 부재)가 발생할 위험이 존재했음.
     - **핵심 기능 우선 개발:** 졸업작품의 본질인 FastAPI AI 의상 검색 파이프라인 및 백엔드 라우팅 완성이 급선무였기 때문에, 복잡한 소셜 로그인 대신 가장 단순한 자체 이메일 가입(`POST /api/auth/join`)으로 개발 범위를 압축했었음.
  2. **이번에 구글 로그인을 다시 도입한 핵심 이유:**
     - **졸업전시회 현장 관람객 경험(UX) 최적화 (가장 결정적 사유):** 부스에 선 관람객이 QR 코드를 찍고 즉석에서 체험하는 환경 특성상, 8자리 복합 비밀번호와 닉네임 입력을 요구하면 가입 단계에서 대다수가 귀찮아서 이탈함. 구글 원클릭 로그인을 통해 **입력 단계 '0초 온보딩'**을 달성하여 부스 회전율과 체험 참여율을 극대화함.
     - **배포 환경이 '웹 브라우저(Vercel, tex-tyle.app)'로 확정:** 팀에서 앱 설치 대신 브라우저 배포로 전환함에 따라 과거의 모바일 앱 딥링크 문제가 해소되고, **표준 웹 OAuth 2.0 리다이렉트**를 가장 안정적으로 활용할 수 있는 최적의 환경이 완성됨.
     - **백엔드 DB 자동 동기화(`POST /api/auth/social-login`) 구조 완성:** 구글 인증 성공 즉시 스프링 부트가 Supabase 토큰을 검증하고 자체 DB에 유저가 없으면 자동 등록(닉네임 `textyle-user` 폴백 포함)하는 동기화 엔드포인트를 구축하여 과거의 데이터 누락 문제를 완벽히 해결함.

---

## 🛠️ 개발 환경 및 인프라 연동 설정

### 1. 환경변수(.env) 설정 및 AWS EC2 실서버 API 연동
* **파일:** `.env`
* **설정 내용:**
  ```env
  EXPO_PUBLIC_FASHION_API_URL=https://api.tex-tyle.app
  ```
* **적용 효과:**
  기존 로컬 개발 환경에서 백엔드 주소가 `http://localhost:8080`으로 폴백되던 현상을 방지하고, 현재 AWS EC2(Caddy HTTPS 역방향 프록시 적용)에 무중단 배포된 라이브 스프링 부트 서버(`https://api.tex-tyle.app`)와 즉시 통신하도록 구성.

### 2. 로컬 웹 개발 런타임 정상화 (Node Modules 물리 설치)
* **내용:**
  Windows 환경의 NTFS 디렉터리 정션(`mklink /J`)으로 인해 Expo Metro 번들러가 번들 스크립트 경로를 루트 상위(`/../../../entry.bundle`)로 오인하여 404 및 흰 화면을 띄우던 이슈를 물리적 `npm install`을 통해 온전한 패키지 트리로 복구함.
* **실행 명령:** `npx expo start --web --port 8081` (정상 구동 확인 완료)

---

## 📌 향후 추가 고려/협의 사항 (To-Do for Team)

1. **회원가입/로그인 모바일 화면 스크롤 영역 보강 (ScrollView)**
   - 화면 높이가 작은 기기나 가상 키보드가 올라왔을 때 버튼 가림 방지를 위한 `ScrollView` / `KeyboardAvoidingView` 레이아웃 협의 후 반영.
2. **졸업전시회 원클릭 게스트(Demo) 계정 연동**
   - 구글 계정마저 연동하기를 꺼리는 관람객을 위한 1초 체험용 둘러보기 버튼 유지/검토.
