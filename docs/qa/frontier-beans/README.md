# 황혼의 콩시장 모바일 QA 캡처

모든 필수 캡처는 실제 로컬 게임을 `393×664` 뷰포트에서 실행해 저장했다. 디버그 전용 장면 전환도 일반 게임과 동일한 서버 액션과 검증기를 통과한 뒤 렌더링된다.

| 파일 | 검증 장면 |
|---|---|
| `01-five-player-default.png` | 5인 기본 게임판, 상대 4명, 밭·손패·중앙 장터 |
| `02-mandatory-front-card.png` | 맨 앞 손패 강제 심기와 심을 수 있는 밭 강조 |
| `03-reveal-and-trade.png` | 공개콩 2장, 뽑기·버림 더미, 거래 가능 농부 |
| `04-card-flip-harvest-table.png` | 선택한 카드 자체가 뒤집히며 실제 수확표 표시 |
| `05-trade-target-selected.png` | 게임판을 유지한 채 거래 상대 직접 선택 |
| `06-trade-offer-editor.png` | 손패·공개콩 실제 선택과 요청 콩·수량 편집 |
| `07-one-card-protection.png` | 1장 밭 보호, 6장 밭만 수확 가능, 강제 심기 |
| `08-received-beans.png` | 받은 콩과 손패 분리, 심을 순서 선택 |
| `09-three-player-three-fields.png` | 3인 상대 2명·내 밭 3개 모바일 배치 |
| `10-harvest-resolution.png` | 밭 전체 수확 뒤 코인·버림 더미 서버 반영 |
| `11-full-bot-game-result.png` | 봇 한 판 완주와 최종 순위 |
| `12-four-player-layout.png` | 4인 상대 3명·내 밭 2개 모바일 배치 |

논리 검증은 `npm run test:frontier-beans`, 화면 검증은 게임 설명 화면의 혼자 디버깅과 인게임 `DEBUG` 메뉴를 사용한다.
