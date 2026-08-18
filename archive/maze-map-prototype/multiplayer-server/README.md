# 미로의 배달부 서버 판정 멀티플레이

최대 8명이 방 코드로 접속하는 WebSocket 게임 서버입니다. 클라이언트는 이동 의도와 행동만 보내고, 서버가 아래 항목을 최종 판정합니다.

- 맵 벽·중앙 제작대·플레이어 충돌
- 이동 속도와 달리기 스태미나
- 아이템 등장, 집기, 소유권, 제출
- 개인 주문, 진행도, 점수, 5분 제한시간
- 밀치기·강력 밀치기 넉백
- 기절, 방해 면역, 급속냉각
- 점프, 유체화, 자리바꾸기, 기름칠
- 스킬 쿨타임과 대상 선택

## 실행

```bash
npm run multiplayer
```

- WebSocket: `ws://localhost:8788/ws`
- 상태 확인: `http://localhost:8788/health`
- 포트 변경: `PORT=9000 npm run multiplayer`
- 허용 출처 제한: `ALLOWED_ORIGINS=https://example.com,https://www.example.com`

공개 웹사이트에서는 TLS를 제공하는 WebSocket 호스팅에 배포하고 게임 URL에 `?server=wss://서버주소/ws`를 전달합니다. 최초 연결 후 해당 주소는 브라우저에 저장됩니다.
