<<<<<<< HEAD
# 한판 — 모바일 술게임·파티게임

QR 또는 4자리 코드로 같은 방에 모여 즐기는 모바일 웹게임 모음이다. 개인전, 모두 협동, 장소 마피아·사라진 보석·CASH AND GUNS 등의 미니(보드)게임을 한 앱에서 제공한다.

## 요구 환경

- Node.js `>=22.13.0`

## 로컬 실행

```bash
npm install
npm run dev
npm run build
```

개발 서버가 출력한 로컬 주소를 열고 새 방을 만들면 된다. 여러 기기 흐름은 브라우저 프로필 또는 실제 휴대폰을 나눠 시험한다.

## 검증

```bash
npm run lint
npm test
npm run test:gem-logic
npm run test:place-mafia
npx tsx scripts/cash-n-guns-audit.ts
```

## 프로젝트 구조

- `app/`: UI, API, 게임 규칙
- `public/`: 이미지, 픽셀아트, 효과음, BGM, 임베디드 게임
- `db/`, `drizzle/`: D1 스키마와 마이그레이션
- `worker/`, `realtime/`: Worker, Durable Object, WebSocket
- `scripts/`, `tests/`: 콘텐츠 동기화와 논리/회귀 검증
- `archive/`: 프로젝트 밖에 있던 기획·프로토타입 자료의 백업

전체 게임 목록과 현재 상태는 `docs/PROJECT_STATE.md`, 작업 규칙은 `AGENTS.md`를 먼저 읽는다.

## 콘텐츠와 DB

```bash
npm run sync:catalog
npm run db:generate
```

콘텐츠 카탈로그를 수정한 뒤에는 반드시 동기화 명령을 실행한다. DB 이력은 `drizzle/`에서 이어가며 기존 마이그레이션을 초기화하지 않는다.

## 배포와 보안

`.openai/hosting.json`에 Sites용 D1/R2 설정이 있고, 미로 게임은 Durable Object/WebSocket을 사용한다. `.env`, API 키, 토큰, 비밀번호는 저장소에 커밋하지 않는다. 기존 Git history와 기존 원격은 보존한다.
=======
# BOARD_MINI_GAME
>>>>>>> 1595673e59fe7b45af4968aebe8c0985e928322e
