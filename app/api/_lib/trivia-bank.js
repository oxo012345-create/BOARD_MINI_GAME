const rows = (text) => text.trim().split("|").map((row) => row.split("/").map((value) => value.trim()));

const reciprocal = (items, forward, reverse) => items.flatMap(([left, right]) => [
  { question: forward(left, right), answer: right },
  { question: reverse(left, right), answer: left },
]);

const capitals = rows(`
대한민국/서울|일본/도쿄|중국/베이징|필리핀/마닐라|태국/방콕|말레이시아/쿠알라룸푸르|싱가포르/싱가포르|인도/뉴델리|파키스탄/이슬라마바드|방글라데시/다카|
네팔/카트만두|부탄/팀푸|스리랑카/스리자야와르데네푸라코테|미얀마/네피도|캄보디아/프놈펜|라오스/비엔티안|베트남/하노이|몽골/울란바토르|카자흐스탄/아스타나|우즈베키스탄/타슈켄트|
키르기스스탄/비슈케크|타지키스탄/두샨베|투르크메니스탄/아시가바트|아프가니스탄/카불|이란/테헤란|이라크/바그다드|사우디아라비아/리야드|아랍에미리트/아부다비|카타르/도하|오만/무스카트|
요르단/암만|레바논/베이루트|이스라엘/예루살렘|튀르키예/앙카라|그리스/아테네|이탈리아/로마|스페인/마드리드|포르투갈/리스본|프랑스/파리|벨기에/브뤼셀|
네덜란드/암스테르담|독일/베를린|스위스/베른|오스트리아/빈|폴란드/바르샤바|체코/프라하|슬로바키아/브라티슬라바|헝가리/부다페스트|루마니아/부쿠레슈티|불가리아/소피아|
세르비아/베오그라드|크로아티아/자그레브|슬로베니아/류블랴나|보스니아 헤르체고비나/사라예보|알바니아/티라나|북마케도니아/스코페|노르웨이/오슬로|스웨덴/스톡홀름|핀란드/헬싱키|덴마크/코펜하겐|
아이슬란드/레이캬비크|아일랜드/더블린|영국/런던|에스토니아/탈린|라트비아/리가|리투아니아/빌뉴스|우크라이나/키이우|몰도바/키시너우|캐나다/오타와|미국/워싱턴 D.C.|
멕시코/멕시코시티|쿠바/아바나|자메이카/킹스턴|파나마/파나마시티|코스타리카/산호세|콜롬비아/보고타|베네수엘라/카라카스|에콰도르/키토|페루/리마|칠레/산티아고|
아르헨티나/부에노스아이레스|우루과이/몬테비데오|파라과이/아순시온|브라질/브라질리아|모로코/라바트|알제리/알제|튀니지/튀니스|이집트/카이로|에티오피아/아디스아바바|케냐/나이로비|
탄자니아/도도마|우간다/캄팔라|가나/아크라|세네갈/다카르|앙골라/루안다|잠비아/루사카|짐바브웨/하라레|마다가스카르/안타나나리보|호주/캔버라|뉴질랜드/웰링턴
`);

const elements = rows(`
수소/H|헬륨/He|리튬/Li|베릴륨/Be|붕소/B|탄소/C|질소/N|산소/O|플루오린/F|네온/Ne|
마그네슘/Mg|알루미늄/Al|규소/Si|인/P|황/S|염소/Cl|아르곤/Ar|칼륨/K|칼슘/Ca|철/Fe|
코발트/Co|니켈/Ni|구리/Cu|아연/Zn|갈륨/Ga|게르마늄/Ge|비소/As|셀레늄/Se|브로민/Br|크립톤/Kr|
루비듐/Rb|스트론튬/Sr|은/Ag|카드뮴/Cd|주석/Sn|아이오딘/I|제논/Xe|세슘/Cs|바륨/Ba|텅스텐/W|
백금/Pt|수은/Hg|납/Pb|비스무트/Bi|라돈/Rn|라듐/Ra|우라늄/U|플루토늄/Pu|티타늄/Ti|망가니즈/Mn
`);

const works = rows(`
오만과 편견/제인 오스틴|위대한 개츠비/F. 스콧 피츠제럴드|노인과 바다/어니스트 헤밍웨이|변신/프란츠 카프카|죄와 벌/표도르 도스토옙스키|
전쟁과 평화/레프 톨스토이|레 미제라블/빅토르 위고|80일간의 세계 일주/쥘 베른|걸리버 여행기/조너선 스위프트|프랑켄슈타인/메리 셸리|
드라큘라/브램 스토커|이상한 나라의 앨리스/루이스 캐럴|피터 팬/J. M. 배리|보물섬/로버트 루이스 스티븐슨|셜록 홈즈/아서 코난 도일|
해리 포터/J. K. 롤링|반지의 제왕/J. R. R. 톨킨|나니아 연대기/C. S. 루이스|백년 동안의 고독/가브리엘 가르시아 마르케스|연금술사/파울로 코엘료|
데미안/헤르만 헤세|이방인/알베르 카뮈|참을 수 없는 존재의 가벼움/밀란 쿤데라|파리대왕/윌리엄 골딩|호밀밭의 파수꾼/J. D. 샐린저|
앵무새 죽이기/하퍼 리|멋진 신세계/올더스 헉슬리|화씨 451/레이 브래드버리|듄/프랭크 허버트|은하수를 여행하는 히치하이커를 위한 안내서/더글러스 애덤스|
토지/박경리|태백산맥/조정래|광장/최인훈|운수 좋은 날/현진건|메밀꽃 필 무렵/이효석|
동백꽃/김유정|날개/이상|소나기/황순원|진달래꽃/김소월|님의 침묵/한용운|
서시/윤동주|꽃/김춘수|난장이가 쏘아올린 작은 공/조세희|우리들의 일그러진 영웅/이문열|채식주의자/한강|
구운몽/김만중|홍길동전/허균|춘향전/작자 미상|사씨남정기/김만중|관동별곡/정철
`);

const landmarks = rows(`
에펠탑/파리|콜로세움/로마|사그라다 파밀리아/바르셀로나|빅벤/런던|브란덴부르크 문/베를린|
아크로폴리스/아테네|알함브라 궁전/그라나다|프라하성/프라하|쇤브룬 궁전/빈|마네킹 피스/브뤼셀|
자유의 여신상/뉴욕|금문교/샌프란시스코|스페이스 니들/시애틀|CN 타워/토론토|치첸이트사/멕시코 유카탄|
마추픽추/페루 쿠스코|구세주 그리스도상/리우데자네이루|모아이 석상/칠레 이스터섬|우유니 소금사막/볼리비아|이과수 폭포/아르헨티나와 브라질 국경|
피라미드/이집트 기자|페트라/요르단|부르즈 할리파/두바이|카파도키아/튀르키예|파르테논 신전/아테네|
타지마할/인도 아그라|만리장성/중국|자금성/베이징|병마용/중국 시안|앙코르와트/캄보디아 시엠레아프|
마리나 베이 샌즈/싱가포르|페트로나스 트윈 타워/쿠알라룸푸르|왓 아룬/방콕|하롱베이/베트남|보로부두르 사원/인도네시아 자바섬|
시드니 오페라하우스/시드니|울루루/호주 노던 준주|스카이 타워/오클랜드|밀포드 사운드/뉴질랜드 남섬|후지산/일본|
경복궁/서울|불국사/경주|해운대/부산|성산일출봉/제주도|수원 화성/수원|
남산서울타워/서울|첨성대/경주|독립기념관/천안|전주 한옥마을/전주|순천만 국가정원/순천
`);

const inventions = rows(`
전화기/알렉산더 그레이엄 벨|실용적인 백열전구/토머스 에디슨|월드 와이드 웹/팀 버너스리|인쇄용 금속 활자/요하네스 구텐베르크|페니실린/알렉산더 플레밍|
다이너마이트/알프레드 노벨|증기기관 개량/제임스 와트|비행기/라이트 형제|축음기/토머스 에디슨|교류 유도 전동기/니콜라 테슬라|
전신기/새뮤얼 모스|안전 엘리베이터/엘리샤 오티스|재봉틀/엘리어스 하우|디젤 엔진/루돌프 디젤|파스퇴르 살균법/루이 파스퇴르|
종두법/에드워드 제너|주기율표/드미트리 멘델레예프|라디오 전신/굴리엘모 마르코니|헬리콥터 설계도/레오나르도 다빈치|기계식 계산기/블레즈 파스칼|
현대식 볼펜/라슬로 비로|지퍼/기드온 선드백|벨크로/조르주 드 메스트랄|전자레인지/퍼시 스펜서|에어컨/윌리스 캐리어|
잠수함/코르넬리스 드레벨|청진기/르네 라에네크|온도계 눈금/다니엘 파렌하이트|배터리/알레산드로 볼타|회전식 인쇄기/리처드 마치 호|
즉석카메라/에드윈 랜드|바코드/노먼 조지프 우들랜드|포스트잇 접착 기술/스펜서 실버|컴퓨터 마우스/더글러스 엥겔바트|최초의 휴대전화/마틴 쿠퍼|
월드 와이드 웹 브라우저/팀 버너스리|리눅스 커널/리누스 토르발스|C 언어/데니스 리치|파이썬 언어/귀도 반 로섬|자바 언어/제임스 고슬링
`);

const abbreviations = rows(`
AI/Artificial Intelligence|AR/Augmented Reality|VR/Virtual Reality|USB/Universal Serial Bus|HTML/HyperText Markup Language|
CSS/Cascading Style Sheets|URL/Uniform Resource Locator|HTTP/HyperText Transfer Protocol|PDF/Portable Document Format|JPEG/Joint Photographic Experts Group|
PNG/Portable Network Graphics|GIF/Graphics Interchange Format|RAM/Random Access Memory|ROM/Read Only Memory|SSD/Solid State Drive|
HDD/Hard Disk Drive|LAN/Local Area Network|WAN/Wide Area Network|IP/Internet Protocol|DNS/Domain Name System|
VPN/Virtual Private Network|SMS/Short Message Service|NFC/Near Field Communication|RFID/Radio Frequency Identification|LED/Light Emitting Diode|
LCD/Liquid Crystal Display|OLED/Organic Light Emitting Diode|ATM/Automated Teller Machine|CCTV/Closed-Circuit Television|UFO/Unidentified Flying Object|
NASA/National Aeronautics and Space Administration|UN/United Nations|WHO/World Health Organization|OECD/Organisation for Economic Co-operation and Development|GDP/Gross Domestic Product|
CEO/Chief Executive Officer|MVP/Most Valuable Player|ASAP/As Soon As Possible|DIY/Do It Yourself|FAQ/Frequently Asked Questions
`);

const units = rows(`
길이/미터(m)|질량/킬로그램(kg)|시간/초(s)|온도/켈빈(K)|물질량/몰(mol)|광도/칸델라(cd)|주파수/헤르츠(Hz)|힘/뉴턴(N)|압력/파스칼(Pa)|에너지/줄(J)|
일률/와트(W)|전하량/쿨롱(C)|전압/볼트(V)|전기저항/옴(Ω)|전기용량/패럿(F)|자기선속/웨버(Wb)|자기장 세기/테슬라(T)|인덕턴스/헨리(H)|광선속/루멘(lm)|조도/럭스(lx)|
방사능/베크렐(Bq)|흡수선량/그레이(Gy)|선량당량/시버트(Sv)|촉매활성/카탈(kat)|평면각/라디안(rad)|입체각/스테라디안(sr)|데이터 전송속도/bps|소리 크기/데시벨(dB)|화면 해상도/픽셀(px)|농도/몰농도(M)|
넓이/제곱미터(㎡)|부피/세제곱미터(㎥)|속력/미터 매 초(m/s)|가속도/미터 매 초 제곱(m/s²)|밀도/킬로그램 매 세제곱미터(kg/㎥)|열량/칼로리(cal)|천문 거리/광년|항해 거리/해리|보석 질량/캐럿(ct)|토지 넓이/헥타르(ha)
`);

const history = rows(`
르네상스가 시작된 나라/이탈리아|종교개혁을 시작한 인물/마르틴 루터|미국 초대 대통령/조지 워싱턴|프랑스의 태양왕/루이 14세|몽골 제국을 세운 인물/칭기즈 칸|
알렉산드로스 대왕의 스승/아리스토텔레스|로마 제국의 초대 황제/아우구스투스|비잔티움 제국의 수도/콘스탄티노폴리스|잉카 제국의 중심 도시/쿠스코|아즈텍 제국의 수도/테노치티틀란|
고대 이집트의 문자/상형문자|메소포타미아의 대표 문자/쐐기문자|함무라비 법전의 왕국/바빌로니아|민주정치가 발달한 고대 도시국가/아테네|스파르타가 있던 반도/펠로폰네소스반도|
백년전쟁의 두 나라/잉글랜드와 프랑스|대항해시대 희망봉을 돈 항해자/바르톨로메우 디아스|인도 항로를 개척한 항해자/바스쿠 다 가마|세계 일주 항해를 시작한 인물/페르디난드 마젤란|미국 노예해방선언을 한 대통령/에이브러햄 링컨|
러시아 혁명의 지도자/블라디미르 레닌|인도 비폭력 독립운동 지도자/마하트마 간디|남아공 인종차별 철폐의 상징/넬슨 만델라|중국 신해혁명의 지도자/쑨원|터키 공화국 초대 대통령/무스타파 케말 아타튀르크|
고구려를 세운 인물/주몽|백제를 세운 인물/온조|발해를 세운 인물/대조영|후삼국을 통일한 고려 왕/태조 왕건|조선의 수도 이름/한양|
거북선을 활용한 조선 장군/이순신|동의보감을 쓴 인물/허준|대동여지도를 만든 인물/김정호|금속활자 직지를 간행한 절/흥덕사|갑신정변의 중심 인물/김옥균|
동학을 창시한 인물/최제우|대한민국 임시정부가 수립된 도시/상하이|3·1 운동이 일어난 해/1919년|광복을 맞은 해/1945년|대한민국 정부가 수립된 해/1948년
`);

const mathQuestions = Array.from({ length: 40 }, (_, index) => {
  const base = (index + 6) * 20;
  const percent = [5, 10, 15, 20, 25][index % 5];
  return { question: `${base}의 ${percent}%는?`, answer: String(base * percent / 100) };
}).concat(Array.from({ length: 40 }, (_, index) => {
  const value = index + 11;
  return { question: `${value}의 제곱은?`, answer: String(value * value) };
})).concat(Array.from({ length: 20 }, (_, index) => {
  const value = index + 2;
  return { question: `${value}의 세제곱은?`, answer: String(value * value * value) };
}));

export function buildTriviaBank(seed) {
  const generated = [
    ...reciprocal(capitals, (country) => `${country}의 수도는 어디인가?`, (_, capital) => `${capital}를 수도로 하는 나라는?`),
    ...reciprocal(elements, (name) => `원소 ${name}의 원소기호는?`, (_, symbol) => `원소기호 ${symbol}가 뜻하는 원소는?`),
    ...reciprocal(works, (work) => `「${work}」의 작가는?`, (work, author) => `${author}가 쓴 작품으로 알맞은 것은?`),
    ...reciprocal(landmarks, (landmark) => `${landmark}이(가) 있는 도시는 또는 지역은?`, (landmark, location) => `${location}의 대표 명소로 알맞은 것은?`),
    ...reciprocal(inventions, (invention) => `${invention}과(와) 관련된 인물은?`, (invention, person) => `${person}과(와) 관련된 발명·발견은?`),
    ...reciprocal(abbreviations, (short) => `${short}의 영문 전체 표현은?`, (_, full) => `${full}을(를) 줄인 말은?`),
    ...reciprocal(units, (quantity) => `${quantity}을(를) 나타내는 대표 단위는?`, (_, unit) => `${unit}은(는) 주로 무엇을 나타내는 단위인가?`),
    ...reciprocal(history, (clue) => `${clue}은(는)?`, (_, answer) => `역사 용어·인물 '${answer}'에 해당하는 설명은?`),
    ...mathQuestions,
  ];
  const unique = [];
  const seen = new Set();
  for (const item of [...seed, ...generated]) {
    if (!item?.question || !item?.answer || seen.has(item.question)) continue;
    seen.add(item.question);
    unique.push(item);
  }
  if (unique.length < 1000) throw new Error(`상식퀴즈가 ${unique.length}개뿐입니다.`);
  return unique.slice(0, 1000);
}
