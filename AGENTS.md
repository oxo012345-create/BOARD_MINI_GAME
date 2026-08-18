# 한판(술게임) 프로젝트 작업 지침

이 저장소는 모바일 파티게임 웹앱 **한판**의 전체 프로젝트다. 특정 게임 하나가 아니라 개인전, 모두 협동, 미니(보드)게임, 공용 방/세션/실시간 통신, 데이터와 미디어 에셋을 함께 관리한다.

## 기준 경로와 실행 환경

- 프로젝트 루트: 이 `AGENTS.md`가 있는 디렉터리
- Node.js: `22.13.0` 이상
- 패키지 관리자: npm (`package-lock.json`을 기준으로 사용)
- 앱 프레임워크: React 19 + Next.js 호환 구조 + vinext/Vite
- 배포 런타임: Cloudflare Workers, D1, R2, Durable Objects를 사용하는 Sites 구성

## 주요 구조

| 경로 | 역할 |
|---|---|
| `app/` | 메인 모바일 UI, 게임 화면, API 라우트와 서버 게임 로직 |
| `app/page.tsx` | 로비, 방, 기본 파티게임 UI와 진행 제어의 중심 |
| `app/api/_lib/` | 방 상태, 라운드, 각 보드게임 규칙, 세션, 실시간 이벤트 |
| `public/` | 게임 이미지, 캐릭터, 배경, 효과음, BGM과 임베디드 게임 에셋 |
| `assets/` | 소스 에셋과 제작 자료 |
| `db/`, `drizzle/` | D1 스키마와 마이그레이션 |
| `worker/` | Cloudflare Worker 및 Durable Object 구현 |
| `realtime/` | 별도 실시간 Worker 설정과 진입점 |
| `scripts/` | 콘텐츠 동기화, 에셋 생성, 게임 논리 감사 스크립트 |
| `tests/` | 렌더링·게임 규칙·상태 동기화 테스트 |
| `archive/workspace-materials/` | 프로젝트 루트 밖에 흩어져 있던 기획서·분석·원본 참고 자료의 보존본 |
| `archive/maze-map-prototype/` | 별도 미로 프로토타입의 소스와 에셋 보존본. 운영 앱에서 직접 실행되는 폴더는 아님 |
| `.openai/hosting.json` | Sites 배포 바인딩과 호스팅 설정 |

## 게임 위치

### 개인전

오리지널 라이어, 바보 라이어, 몸으로 라이어, 얼굴로 라이어, 라이어-질문, 초성 퀴즈, 무한 훈민정음, 취향 일치, 중급 상식 퀴즈, 가짜 추억 찾기, 정확히 10초, 색깔 찾기, 초성 물건 찾기, 아파트 게임, 오리지널 마피아가 있다.

- 공통 화면: `app/page.tsx`
- 라운드 생성과 판정: `app/api/_lib/rounds.ts`
- 콘텐츠 원본/동기화: `content-catalog.html`, `content-data.js`, `app/api/_lib/content-data.js`, `scripts/sync-catalog-data.mjs`
- 사진 게임 업로드: `app/api/photo/`, `app/api/photo-upload/`, `app/api/photos/`

### 모두 협동

텔레그레이션, 인물 퀴즈, 줄줄이 말해요, 네 글자 이어말하기, 이어말하기·팀전, 캐릭터 퀴즈, 단체 초성 퀴즈가 있다.

오리지널 마피아는 `app/mafia.tsx`, `app/mafia.css`, `app/api/_lib/mafia.ts`, `public/mafia/`에 구현되어 있다. 4~8명, 경찰·의사 포함, 익명 기권 투표, 최후의 변론과 생사 투표를 사용한다.

- 공통 화면과 캔버스: `app/page.tsx`
- 라운드/문제 데이터: `app/api/_lib/rounds.ts`, `content-data.js`

### 미니(보드)게임

| 게임 | 주요 코드 | 주요 에셋 |
|---|---|---|
| 장소 마피아 | `app/place-mafia.tsx`, `app/place-mafia-shared.ts`, `app/api/_lib/place-mafia.ts` | `public/place-mafia/` |
| 수상한 딜러들 | `app/api/_lib/dealer.ts`, `app/page.tsx` | `public/dealer-*` |
| 미로의 배달부 | `app/api/_lib/maze.ts`, `app/api/_lib/maze-rules.ts`, `worker/maze-room.ts` | `public/maze-courier/` |
| 사라진 보석 | `app/api/_lib/gem-heist-data.ts`, `app/api/_lib/rounds.ts`, `app/gem-heist-assets.ts` | `public/gem-heist/` |
| CASH AND GUNS | `app/cash-n-guns.tsx`, `app/cash-n-guns.css`, `app/api/_lib/cash-n-guns.ts` | `public/cash-n-guns/` |

## 개발 명령

```bash
npm install
npm run dev
npm run lint
npm run build
npm test
```

게임별 논리 검증:

```bash
npm run test:gem-logic
npm run test:place-mafia
npx tsx scripts/cash-n-guns-audit.ts
```

콘텐츠 변경 후 동기화:

```bash
npm run sync:catalog
```

DB 스키마 변경 후 마이그레이션 생성:

```bash
npm run db:generate
```

## 필수 개발 규칙

1. 기존 게임, UI, 데이터, 이미지, 오디오, API 또는 배포 설정을 임의로 삭제하지 않는다.
2. 한 게임을 수정하기 전에 공용 방 상태, `app/page.tsx`, `rounds.ts`, DB 상태, 재접속, 방장 위임, 깜짝 룰에 미치는 영향을 먼저 확인한다.
3. 서버가 소유해야 하는 비밀 역할·정답·투표·공격·전리품 결과를 클라이언트 판단으로 옮기지 않는다.
4. 모든 상태 변경은 4~8명 동시 접속, 새로고침, iPhone 백그라운드 복귀, 방장 이탈/재접속을 고려한다.
5. 모바일 UI는 최소 `393x664`뿐 아니라 더 작고 긴 화면에서도 버튼, 캐릭터, 팝업, 전리품이 잘리지 않는지 확인한다.
6. 미디어를 교체할 때 파일명만 맞추지 말고 실제 참조 경로, 종횡비, 투명 배경, 저작권/사용 권한을 함께 확인한다.
7. `content-data.js` 계열을 직접 따로 수정해 불일치를 만들지 않는다. 카탈로그 원본을 바꾼 뒤 동기화 스크립트를 실행한다.
8. DB 스키마 변경 시 기존 `drizzle/` 이력을 삭제하거나 초기화하지 않는다.
9. `.openai/hosting.json`, Worker 바인딩, D1/R2/DO 설정을 변경하기 전에 로컬·배포 환경의 영향 범위를 기록한다.
10. 생성 캐시, 로컬 로그, `.env`, 토큰과 자격 증명은 커밋하지 않는다.
11. 큰 구조 변경이나 리팩터링은 요청 범위를 벗어나서 진행하지 않는다. 기존 동작을 보존하는 작은 변경을 우선한다.
12. 작업 완료 전 최소한 lint/build와 관련 게임 감사 스크립트를 실행하고, 실행하지 못한 검증은 명시한다.

## 백업과 이력 규칙

- 기존 Git history를 재작성, squash, reset 또는 초기화하지 않는다.
- `origin`은 기존 Sites 내부 원격일 수 있다. GitHub 원격을 추가할 때 기존 원격을 덮어쓰지 말고 별도 이름을 사용한다.
- `archive/`는 과거 자료 보존용이다. 운영 코드로 옮기거나 삭제하기 전에 현재 앱의 대응 파일과 비교한다.
- `node_modules/`, `dist/`, `.next/`, `.vinext/`, `.wrangler/`, `.sites-package/`, `artifacts/`, `tmp/`, 로그와 로컬 빌드 캐시는 백업 대상이 아니다.
