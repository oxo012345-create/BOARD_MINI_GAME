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
| `13-layout-3p.png` | 정보 위계 개선 후 3인·밭 3개 최종 배치 |
| `14-layout-4p.png` | 중앙 상대와 장터가 겹치지 않는 4인 최종 배치 |
| `15-layout-5p-trade.png` | 상대 미니 밭·확대 공개콩이 보이는 5인 거래 단계 |
| `16-card-flip-same-slot.png` | 손패 순서와 위치를 유지한 동일 카드 뒤집기 |
| `17-reference-art-5p-trade.png` | 첨부 기준 시안의 구도·픽셀아트 오브젝트를 재현한 5인 거래 단계와 첫 카드 수확표 |
| `18-layout-refined-3p.png` | 가독성 비율 조정 후 상대 2명·내 밭 3개·확대 손패가 한 화면에 들어오는 3인 거래 단계 |
| `19-layout-refined-4p.png` | 세 번째 상대를 측면에 배치해 중앙 뽑기·버림 더미를 가리지 않는 4인 거래 단계 |
| `20-layout-refined-5p-trade.png` | 확대 장터·공개콩·상대 밭·내 밭과 같은 자리에서 뒤집힌 첫 손패를 함께 검증한 5인 최종 화면 |
| `21-rules-ui-3p-trade.png` | 모든 농부가 3개 밭을 갖고 중앙 장터 안전 구역과 충돌하지 않는 3인 거래 화면 |
| `22-rules-ui-4p-trade.png` | 모든 농부가 2개 밭을 갖고 세 번째 상대와 중앙 카드가 충돌하지 않는 4인 거래 화면 |
| `23-rules-ui-5p-trade.png` | 공개콩·더미·상대 4명 사이의 교차가 0건이며 받은 콩 잠금 줄이 분리된 5인 거래 화면 |
| `24-four-player-full-flow-fixed.png` | 실제 4인 한 턴 진행 중 발견한 손패 선택·거래판·상대 선택 잘림 문제를 수정하는 과정의 거래 화면 |
| `25-four-player-qa-final.png` | 수정 후 393×664에서 상대 3명, 중앙 장터, 거래 요약, 기존 손패 직접 선택을 최종 검증한 4인 화면 |
| `26-ui-v3-5p.png` | 밝은 농장 UI V3에서 상대 4명·중앙 덱·열매 한 개가 열린 내 밭·손패가 스크롤 없이 보이는 5인 심기 화면 |
| `27-ui-v3-trade.png` | 상대/나 각 8칸, 공개콩, 기존 손패가 위계대로 분리된 V3 거래 화면 |

논리 검증은 `npm run test:frontier-beans`, 화면 검증은 게임 설명 화면의 혼자 디버깅과 인게임 `DEBUG` 메뉴를 사용한다.
