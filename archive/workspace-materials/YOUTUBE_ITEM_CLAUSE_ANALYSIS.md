# Double Dealers 유튜브 아이템·조항 조사

조사일: 2026-07-31  
대상: 유튜브에서 현재 공개 검색되는 `Double Dealers gameplay` 스트리머 영상  
목적: 오프라인 대화형 모바일 웹게임의 아이템·조항 설계 참고

## 1. 먼저 결론

- 영상에서 직접 확인한 아이템: **29종**
- 영상에서 직접 확인한 조항 효과: **25종**
- 조항은 아이템에 고정되지 않는다. **같은 아이템에도 매 판 서로 다른 조항 2개가 붙는다.**
- 따라서 구현 데이터는 `아이템 테이블`과 `조항 테이블`을 분리해야 한다.
- 아이템의 시장가도 고정값이 아니다. 같은 아이템이 `-$250`부터 `$980`까지 달라지는 사례가 확인됐다.
- 원작의 재미는 아이템 자체보다 `실제 시장가 + 무작위 조항 2개`를 판매자만 안다는 정보 비대칭에서 나온다.

> 아래 내용은 제가 만든 아이디어가 아니라 영상 UI에서 직접 판독한 내용이다. 한국어 문장은 구현하기 쉽게 번역·요약했으며, 원문의 오탈자와 어색한 문법은 그대로 옮기지 않았다.

## 2. 조사 범위와 신뢰도

유튜브 검색 결과에서 스트리머·게임플레이 영상 18편을 찾았다. 그중 결과 카드가 오래 노출되는 무편집 장편 플레이를 중심으로 프레임 단위 판독을 수행했다.

- **A급 근거:** 판매 완료 화면에서 아이템명, 시대, 실제 시장가, 조항 2개를 직접 확인
- **B급 근거:** 아이템 선택 화면에서 아이템명, 예상 가격 범위, 시대, 첫 번째 조항을 확인
- **C급 근거:** 다른 영상의 중복 장면 또는 편집 영상에서 교차 확인

비공개·일부공개·검색 미노출 영상까지 포함한 인터넷상의 “모든 영상”을 보장할 수는 없다. 이 문서의 “전체”는 조사일 현재 공개 검색으로 발견된 후보 전체를 뜻한다.

### 추가 검증

[SimplyAdum의 1시간 33분 전체 플레이](https://www.youtube.com/watch?v=xKMsmOOwU4s)에서 판매 결과 카드 64건을 추가 판독했다. 영상에 표시된 데모 버전은 `v0.1.16`이다. 기존 조항의 새로운 조합은 다수 확인됐지만 새로운 고유 조항은 발견되지 않았다. 따라서 공개 영상에서 실제 게임 조항으로 검증된 목록은 현재 25종이며, 확인되지 않은 효과를 원작 조항으로 추가하지 않는다.

## 3. 확인된 아이템 29종

시장가는 영상에서 실제로 관찰된 값이다. 원작의 고정 가격표가 아니라 매 판 변동하는 결과 표본이다.

| # | 아이템 | 시대 | 관찰된 실제 시장가 | 근거 |
|---:|---|---|---:|---|
| 1 | A Mug of Coffee | Modern Era | $520 | A |
| 2 | Antique Vase | Ancient Rome Era | -$250, $20, $660, $860 | A |
| 3 | Charcoal Iron | Victorian Era | $400, $720 | A |
| 4 | Chariot Wheel | Ancient Rome Era | $170, $720 | A |
| 5 | Cithara | Ancient Rome Era | $250 | A |
| 6 | Crown | Medieval Era | $210 | A |
| 7 | Ea-Nasir's Copper | Bronze Age | $820 | A |
| 8 | Flower Pot | Modern Era | $580, $710, $860 | A |
| 9 | Folding Fan | Victorian Era | -$250, $210 | A |
| 10 | Geiger Counter | Cold War Era | $460, $940 | A |
| 11 | Gold Medal of Honor | 1940s | $700 | A |
| 12 | Golden Cross | Medieval Era | $180, $370, $580 | A |
| 13 | Golden Egg | Medieval Era | $110, $690, $770 | A |
| 14 | Golden Key | Victorian Era | -$250, $70, $160 | A |
| 15 | Guitar | Modern Era | -$250, $960 | A |
| 16 | Helmet | 1940s | $230, $270, $320 | A |
| 17 | Hourglass | Medieval Era | -$250, $580 | A |
| 18 | Katana | Medieval Era | $310, $410 | A |
| 19 | Model Ship | Victorian Era | $250, $790 | A |
| 20 | Old Chest | Medieval Era | $50, $350, $920 | A |
| 21 | Pistol | 1940s | $800, $830, $990 | A |
| 22 | Retro Monitor | Cold War Era | $890 | A |
| 23 | Rocket Launcher | Cold War Era | $340, $670, $960, $990 | A |
| 24 | Roman Sandals | Ancient Rome Era | -$250, $150, $320, $950 | A |
| 25 | Sealed Scroll | Medieval Era | $180 | A |
| 26 | Silver Medal of Honor | 1940s | 예상가 $200–490 | B |
| 27 | Sword | Medieval Era | $570 | A |
| 28 | Viking Helmet | Medieval Era | -$250, $740, $980 | A |
| 29 | Vintage Typewriter | Cold War Era | $50 | A |

### 시대별 분류

| 시대 | 아이템 수 | 아이템 |
|---|---:|---|
| Bronze Age | 1 | Ea-Nasir's Copper |
| Ancient Rome Era | 4 | Antique Vase, Chariot Wheel, Cithara, Roman Sandals |
| Medieval Era | 9 | Crown, Golden Cross, Golden Egg, Hourglass, Katana, Old Chest, Sealed Scroll, Sword, Viking Helmet |
| Victorian Era | 4 | Charcoal Iron, Folding Fan, Golden Key, Model Ship |
| 1940s | 4 | Gold Medal of Honor, Silver Medal of Honor, Helmet, Pistol |
| Cold War Era | 4 | Geiger Counter, Retro Monitor, Rocket Launcher, Vintage Typewriter |
| Modern Era | 3 | A Mug of Coffee, Flower Pot, Guitar |

> 영상 UI의 시대 표기를 그대로 따랐다. 시대별 개수는 중복 표기 및 영상 버전 차이 때문에 향후 공식 빌드에서 달라질 수 있다.

## 4. 확인된 조항 풀 25종

`추천 성향`은 우리 오프라인 술자리 버전에 맞춰 제가 붙인 운영 태그다. 조항의 내용 자체는 영상 근거다.

| ID | 영상에서 확인한 효과의 한국어 요약 | 유형 | 추천 성향 |
|---|---|---|---|
| C01 | 어떤 시대 아이템과도 세트 보너스를 만든다 | 세트 | 강한 이득 |
| C02 | 구매자는 이 아이템을 1라운드 동안 팔 수 없다 | 보유 제한 | 약한 손해 |
| C03 | 상점 판매 시 가격 +30% | 가격 | 강한 이득 |
| C04 | 보유 카드 한 장마다 가격 +10% | 카드 연계 | 이득 |
| C05 | 시장 판매 시 현재 보유 아이템 한 개마다 +12% | 재고 연계 | 이득 |
| C06 | 판매자의 무작위 카드 한 장을 제거한다 | 카드 파괴 | 판매자 손해 |
| C07 | 상점 판매 시 33% 확률로 3배, 실패하면 1/3 가격 | 도박 | 고변동 |
| C08 | 구매자는 한 핸드 동안 입을 막고 말할 수 없다 | 현실 행동 | 벌칙 |
| C09 | -$250에서 시작하고, 보유자가 어느 경매든 입찰할 때마다 이 아이템 가치 +$50. 10핸드 후 자동 판매 | 성장형 | 고변동 |
| C10 | 구매자의 무작위 카드 한 장을 제거한다 | 카드 파괴 | 구매자 손해 |
| C11 | 판매자와 구매자가 복싱 대결을 하며 승자가 아이템과 돈을 모두 가진다 | 미니게임 | 고변동 |
| C12 | 구매자는 카드 전부를 잃고, 잃은 카드 한 장마다 $150를 받는다 | 카드 교환 | 상황형 |
| C13 | 판매자는 한 핸드 동안 입을 막고 말할 수 없다 | 현실 행동 | 벌칙 |
| C14 | 상점 카드 리롤 한 번마다 가격 +10% | 상점 연계 | 이득 |
| C15 | 체크아웃 총액이 $500를 넘으면 추가 $100 | 체크아웃 | 이득 |
| C16 | 판매자는 1라운드 동안 카드를 사용할 수 없다 | 카드 제한 | 판매자 손해 |
| C17 | 보유 중 매 라운드 50% 확률로 $150 획득 또는 $150 손실 | 도박 | 고변동 |
| C18 | 플레이어에게 판매하면 수익을 판매자와 무작위 플레이어가 절반씩 나눈다 | 수익 분배 | 판매자 손해 |
| C19 | 인벤토리에 있는 동안 전체 판매가 +15% | 패시브 | 강한 이득 |
| C20 | 빈 카드 슬롯 하나마다 가격 +10% | 카드 연계 | 상황형 |
| C21 | 인벤토리에 머문 라운드마다 가치 -$100 | 감가 | 손해 |
| C22 | 아이템의 시대가 매 핸드 바뀐다 | 세트 변동 | 고변동 |
| C23 | 구매 즉시 사라지고, 7핸드 뒤 보유 아이템 하나의 복제품으로 돌아온다 | 복제 | 고변동 |
| C24 | 구매자는 1라운드 동안 카드를 사용할 수 없다 | 카드 제한 | 구매자 손해 |
| C25 | 상점 판매 시 가격 +10% | 가격 | 약한 이득 |

### 원작에서 직접 확인한 조합 예시

| 아이템 | 조항 1 | 조항 2 | 관찰 결과 |
|---|---|---|---|
| Katana | 구매자 침묵 1핸드 | 판매자 카드 1장 제거 | $550 낙찰 / 시장가 $410 |
| Antique Vase | 모든 시대와 세트 | 구매 후 1라운드 판매 금지 | $250 낙찰 / 시장가 $20 |
| Golden Cross | 모든 시대와 세트 | 상점 판매 +30% | $300 낙찰 / 시장가 $580 |
| Golden Egg | 카드당 가격 +10% | 보유 아이템당 시장 판매 +12% | $450 낙찰 / 시장가 $110 |
| Vintage Typewriter | 판매자 카드 1장 제거 | 33% 3배, 실패 시 1/3 | $400 낙찰 / 시장가 $50 |
| Viking Helmet | 구매자 침묵 | -$250 성장형 자동 판매 | $350 낙찰 / 시장가 -$250 |
| Golden Key | 구매자 카드 1장 제거 | 판매자·구매자 복싱 | $400 낙찰 / 시장가 $160 |
| Retro Monitor | 카드당 가격 +10% | 구매자 카드 전부 현금화 | $450 낙찰 / 시장가 $890 |
| Ea-Nasir's Copper | 판매자·구매자 복싱 | 매 라운드 ±$150 | $1,000 낙찰 / 시장가 $820 |
| Model Ship | 체크아웃 $500 초과 시 +$100 | 33% 3배, 실패 시 1/3 | $600 낙찰 / 시장가 $250 |
| Geiger Counter | 전체 판매가 +15% | 빈 카드 슬롯당 +10% | $700 낙찰 / 시장가 $940 |
| Folding Fan | 매 라운드 ±$150 | 수익을 무작위 플레이어와 절반 분배 | $150 낙찰 / 시장가 $210 |
| Pistol | 33% 3배, 실패 시 1/3 | 시대가 매 핸드 변경 | $1,000 낙찰 / 시장가 $830 |
| Model Ship | 구매 후 1라운드 판매 금지 | 구매 즉시 소멸, 7핸드 뒤 복제품 | $300 낙찰 / 시장가 $790 |
| A Mug of Coffee | 모든 시대와 세트 | 카드당 가격 +10% | $550 낙찰 / 시장가 $520 |

## 5. 오프라인 휴대폰 버전에 옮길 때의 변환 원칙

원작의 카드·복싱·음성채팅을 그대로 복제하면 사용자가 원하는 “한자리에서 직접 토론하는 술자리 게임”과 충돌한다. 핵심 정보 구조는 유지하되 실행만 다음처럼 바꾸는 것이 좋다.

| 원작 요소 | 휴대폰 오프라인 버전 |
|---|---|
| 인게임 음성채팅 | 실제 자리에서 자유 토론 |
| 복싱 미니게임 | 가위바위보 3판 2선승 또는 5초 탭 대결 |
| 입이 테이프로 막힘 | 실제로 60초 침묵, 말하면 벌금 |
| 카드 파괴 | 보유 행동 카드 1장을 앱이 무작위 폐기 |
| 7핸드 뒤 복제 | 2라운드 뒤 보유품 하나를 앱이 무작위 복제 |
| 매 핸드 시대 변경 | 다음 경매가 끝날 때마다 시대 자동 변경 |
| 모든 시대 세트 | 와일드카드 아이템 |
| 시장·상점 | 각자 휴대폰에서 비공개 체크아웃 및 카드 구매 |

### 권장 MVP 조항 16개

초기 버전에는 C01, C02, C03, C04, C05, C07, C08, C09, C10, C13, C15, C17, C18, C20, C21, C24를 넣는다.

- 술자리에서 바로 이해할 수 있다.
- 휴대폰만으로 자동 처리할 수 있다.
- 복싱처럼 별도 3D 미니게임을 먼저 만들 필요가 없다.
- 침묵, 수익 분배, 가치 성장처럼 테이블에서 웃음이 나는 결과가 충분하다.

## 6. 구현용 데이터 구조

```ts
type Item = {
  id: string;
  nameKo: string;
  nameEn: string;
  era: "bronze" | "rome" | "medieval" | "victorian" | "1940s" | "cold_war" | "modern";
  modelUrl: string;
  priceMin: number;
  priceMax: number;
};

type Clause = {
  id: string;
  titleKo: string;
  descriptionKo: string;
  polarity: "positive" | "negative" | "mixed";
  trigger: "on_buy" | "on_sell" | "on_hold" | "on_bid" | "round_end";
  incompatibleWith: string[];
};

type AuctionLot = {
  itemId: string;
  actualMarketPrice: number;
  clauseIds: [string, string];
};
```

조항 조합 시 아래 충돌은 막는다.

- `C03 상점 +30%`와 `C25 상점 +10%` 동시 부여 금지
- 구매자 대상 카드 제거 조항과 구매자 카드 전체 제거 조항 동시 부여 금지
- 판매자 침묵과 구매자 침묵은 동시 부여 가능
- 즉시 소멸 조항과 즉시 판매 금지 조항은 함께 나오지 않게 하는 것이 이해하기 쉽다
- 강한 이득 2개 또는 강한 손해 2개 조합은 낮은 확률로 제한한다

## 7. 발견한 공개 영상 목록

### 심층 판독 및 교차 검증

1. [Mithzan – Double Dealers, 48:01](https://www.youtube.com/watch?v=H5ipnM5fr-w) — 한 경기 전체, 결과 카드 판독의 주 근거
2. [WILDCAT – We Found the Most Racist Game on Steam..., 33:01](https://www.youtube.com/watch?v=rEsBbI7Gj30) — 두 번째 전체 경기, 신규 아이템·조항 교차 확인
3. [우주하마 – 사기 잘 치는 사람이 이기는 경매 게임, 30:54](https://www.youtube.com/watch?v=mJS35I1Ubw8) — 한국어 반응 및 편집 흐름 확인
4. [LinLin_089 – Double Dealers, 52:25](https://www.youtube.com/watch?v=GdIxzLP4MGM) — 장편 플레이 화면 교차 확인

### 검색 발견·목록화

5. [SoDizzzy – Double dealers but we're actually insane, 17:29](https://www.youtube.com/watch?v=AZMncr83qGw)
6. [서찬범 – 친구한테 사기쳐야 하는 경매게임…, 17:29](https://www.youtube.com/watch?v=my-aDrMrBek)
7. [FizzBigg – Double Dealers, 12:59](https://www.youtube.com/watch?v=Eisi6k1p5oo)
8. [KEOXER GAMING – Double Dealers, 20:35](https://www.youtube.com/watch?v=SbXxAdb6GIk)
9. [TheLostBoy – Double Dealers, 25:10](https://www.youtube.com/watch?v=6qJgkY0wpF0)
10. [dizzy – Double Dealers, 11:57](https://www.youtube.com/watch?v=Fc_fhdO8Nlg)
11. [Coringa Games – Double Dealers, 1:07:31](https://www.youtube.com/watch?v=BsxZehsfQ4I)
12. [alanzoka – Double Dealers, 1:18:39](https://www.youtube.com/watch?v=vmqvPlJvpj4)
13. [FaTaL WeAzIL – Double Dealers, 16:38](https://www.youtube.com/watch?v=uSBNXXXquxo)
14. [AL3X – Double Dealers, 47:57](https://www.youtube.com/watch?v=IpEZnZMgG4c)
15. [XCubaLibreX – Double Dealers, 11:51](https://www.youtube.com/watch?v=ld19SK4WVBg)
16. [Christopher Devin – Double Dealers, 59:46](https://www.youtube.com/watch?v=2ghKdf73gmI)
17. [SimplyAdum – Double Dealers, 1:33:45](https://www.youtube.com/watch?v=xKMsmOOwU4s)
18. [weightyjoker – Double Dealers, 13:27](https://www.youtube.com/watch?v=mOMmtJCOL_0)

공식 소개 영상은 스트리머 목록에서 제외했다.

## 8. 주의할 점

- 이 자료는 게임 규칙을 연구하기 위한 요약이며 영상 파일이나 원작의 3D 모델·텍스처를 제품에 복제하면 안 된다.
- 아이템 명칭처럼 일반적인 소재는 참고할 수 있지만, 원작 UI·캐릭터·브랜드·문구·3D 모델은 독자적으로 다시 디자인해야 한다.
- 데모가 업데이트되면 아이템, 숫자, 조항 문구가 바뀔 수 있다.
- 실제 서비스에서는 조항 수치를 그대로 복제하기보다 6–8인 술자리의 플레이 시간에 맞춰 재조정해야 한다.
