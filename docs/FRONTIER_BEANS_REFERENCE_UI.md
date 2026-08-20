# 황혼의 콩시장 기준 시안 UI

## 시각 기준

2026-08-20 사용자 첨부 이미지를 단일 시각 기준으로 사용한다. 전체 구도는 방 정보와 인원, 중앙 단계 간판, 좌우 상대 네 명, 중앙 나무 장터, 하단 내 농부와 2칸 밭, 맨 아래 손패 순서를 유지한다. 393×664에서 스크롤 없이 한 장면으로 렌더링한다.

## 에셋 구조

`public/frontier-beans/ui-v2/`에는 다음 로컬 고정 PNG가 있다.

- `market-table.png`: 뽑기·버림·공개 카드 2장을 올리는 네 칸 나무 장터
- `two-fields.png`, `field-plot.png`: 2칸 농지와 3인용 단일 농지
- `hand-table.png`: 하단 손패를 받치는 천과 목재 테이블
- `card-face.png`: 앞면과 수확표 뒷면이 공유하는 양피지 카드
- `name-plank.png`, `phase-sign.png`, `crop-sign.png`, `room-plaque.png`: 용도별 명패와 간판
- `trade-board.png`: 거래 제안과 요청을 올리는 물리 장터 게시판
- `button-accept.png`, `button-reject.png`, `button-plant.png`, `button-harvest.png`, `button-bell.png`, `button-cancel.png`: 서로 다른 재료와 형태의 조작 오브젝트

HTML/CSS는 이 에셋의 위치, 라이브 텍스트, 카드·작물 데이터, 선택·비활성·눌림 상태만 제어한다. 밭이나 장터 형태를 CSS border, gradient, box-shadow만으로 다시 만들지 않는다.

## 생성 프롬프트 요약

내장 imagegen을 사용했다. 모든 프롬프트는 첨부 이미지를 스타일·구도 기준으로 지정하고 다음 불변 조건을 공유한다.

- 고급 32비트 픽셀아트, 서부 개척 농장, 따뜻한 황혼 등불
- 투명 배경의 물리 오브젝트, 단단한 픽셀 클러스터와 재료 마모 표현
- 텍스트·숫자·캐릭터·워터마크 제외, 라이브 데이터가 들어갈 면은 비워 둠
- HTML 패널, 둥근 사각형, CSS 테두리, 매끈한 벡터 표현 금지

개별 프롬프트는 4칸 나무 장터, 2칸 고랑 농지, 양피지 카드, 손패 테이블, 용도별 명패, 서로 다른 조작 도구, 거래 게시판을 각각 독립 게임 오브젝트로 제작하도록 지정했다.
