export type VerifiedImage = {
  id: string;
  answer: string;
  url: string;
  source: string;
};

const wiki = (id: string, answer: string, url: string, source: string): VerifiedImage => ({ id, answer, url, source });

export const VERIFIED_IMAGES: Record<"people" | "character" | "zoom", VerifiedImage[]> = {
  people: [
    wiki("p01", "유재석", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Yoo_Jae_Suk_going_to_work_at_Happy_Together_on_August_19%2C_2017_%281%29.jpg/330px-Yoo_Jae_Suk_going_to_work_at_Happy_Together_on_August_19%2C_2017_%281%29.jpg", "https://ko.wikipedia.org/wiki/유재석"),
    wiki("p02", "강호동", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/%27%ED%95%9C%EB%81%BC%EC%A4%8D%EC%87%BC%27_%EC%A0%9C%EC%9E%91%EB%B0%9C%ED%91%9C%ED%9A%8C_%ED%98%84%EC%9E%A5_14s.jpg/330px-%27%ED%95%9C%EB%81%BC%EC%A4%8D%EC%87%BC%27_%EC%A0%9C%EC%9E%91%EB%B0%9C%ED%91%9C%ED%9A%8C_%ED%98%84%EC%9E%A5_14s.jpg", "https://ko.wikipedia.org/wiki/강호동"),
    wiki("p03", "이수근", "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Lee_soo_geun.jpg/330px-Lee_soo_geun.jpg", "https://ko.wikipedia.org/wiki/이수근"),
    wiki("p04", "전현무", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/MBC_%27%EB%82%98_%ED%98%BC%EC%9E%90_%EC%82%B0%EB%8B%A4%27_%EA%B8%B0%EC%9E%90_%EA%B0%84%EB%8B%B4%ED%9A%8C_%EC%A0%84%ED%98%84%EB%AC%B4.jpg/330px-MBC_%27%EB%82%98_%ED%98%BC%EC%9E%90_%EC%82%B0%EB%8B%A4%27_%EA%B8%B0%EC%9E%90_%EA%B0%84%EB%8B%B4%ED%9A%8C_%EC%A0%84%ED%98%84%EB%AC%B4.jpg", "https://ko.wikipedia.org/wiki/전현무"),
    wiki("p05", "박명수", "https://upload.wikimedia.org/wikipedia/commons/1/14/Park_Myeong-su_from_Acrofan.jpg", "https://ko.wikipedia.org/wiki/박명수"),
    wiki("p06", "조세호", "https://upload.wikimedia.org/wikipedia/commons/9/96/Choseho2020.png", "https://ko.wikipedia.org/wiki/조세호"),
    wiki("p07", "이영지", "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Lee_Young-ji.png/330px-Lee_Young-ji.png", "https://ko.wikipedia.org/wiki/이영지"),
    wiki("p08", "장도연", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/KBS%EC%9B%94%EB%93%9C_%27%EB%8D%94_%EB%B7%B0%ED%8B%B0_%EC%8B%9C%EC%A6%8C_2%27_%EC%A0%9C%EC%9E%91%EB%B0%9C%ED%91%9C%ED%9A%8C_%EC%9E%A5%EB%8F%84%EC%97%B0.jpg/330px-KBS%EC%9B%94%EB%93%9C_%27%EB%8D%94_%EB%B7%B0%ED%8B%B0_%EC%8B%9C%EC%A6%8C_2%27_%EC%A0%9C%EC%9E%91%EB%B0%9C%ED%91%9C%ED%9A%8C_%EC%9E%A5%EB%8F%84%EC%97%B0.jpg", "https://ko.wikipedia.org/wiki/장도연"),
    wiki("p09", "아이유", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/221125_%EC%B2%AD%EB%A3%A1%EC%98%81%ED%99%94%EC%83%81_%EB%A0%88%EB%93%9C%EC%B9%B4%ED%8E%AB_01_%28cropped%29.jpg/330px-221125_%EC%B2%AD%EB%A3%A1%EC%98%81%ED%99%94%EC%83%81_%EB%A0%88%EB%93%9C%EC%B9%B4%ED%8E%AB_01_%28cropped%29.jpg", "https://ko.wikipedia.org/wiki/아이유"),
    wiki("p10", "태연", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/230609_Kim_Tae_Yeon_%28%EA%B9%80%ED%83%9C%EC%97%B0%29.png/330px-230609_Kim_Tae_Yeon_%28%EA%B9%80%ED%83%9C%EC%97%B0%29.png", "https://ko.wikipedia.org/wiki/태연"),
    wiki("p11", "임영웅", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Temp_1662384481565.-511956263.jpg/330px-Temp_1662384481565.-511956263.jpg", "https://ko.wikipedia.org/wiki/임영웅"),
    wiki("p12", "손흥민", "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/BFA_2023_-2_Heung-Min_Son_%28cropped%29.jpg/330px-BFA_2023_-2_Heung-Min_Son_%28cropped%29.jpg", "https://ko.wikipedia.org/wiki/손흥민"),
    wiki("p13", "김연아", "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/YuNaKimInVancouver.jpg/330px-YuNaKimInVancouver.jpg", "https://ko.wikipedia.org/wiki/김연아"),
    wiki("p14", "봉준호", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Bong_Joon-ho_2017.jpg/330px-Bong_Joon-ho_2017.jpg", "https://ko.wikipedia.org/wiki/봉준호"),
    wiki("p15", "마동석", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Don_Lee_by_Gage_Skidmore.jpg/330px-Don_Lee_by_Gage_Skidmore.jpg", "https://ko.wikipedia.org/wiki/마동석"),
    wiki("p16", "전지현", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Jun_Ji-hyun.jpg/330px-Jun_Ji-hyun.jpg", "https://ko.wikipedia.org/wiki/전지현"),
    wiki("p17", "신사임당", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/ShinSaimdangOldPortrait.webp/330px-ShinSaimdangOldPortrait.webp.png", "https://ko.wikipedia.org/wiki/신사임당"),
    wiki("p18", "유관순", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Ryu_Gwan-sun.jpg/330px-Ryu_Gwan-sun.jpg", "https://ko.wikipedia.org/wiki/유관순"),
    wiki("p19", "안중근", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/An_Jung-geun.JPG/330px-An_Jung-geun.JPG", "https://ko.wikipedia.org/wiki/안중근"),
    wiki("p20", "김연경", "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Kim_Yeon-koung_in_December_2025.png/330px-Kim_Yeon-koung_in_December_2025.png", "https://ko.wikipedia.org/wiki/김연경"),
    wiki("p21", "황희찬", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/SV_Mattersburg_gegen_FC_RB_Salzburg_%282._November_2019%29_90.jpg/330px-SV_Mattersburg_gegen_FC_RB_Salzburg_%282._November_2019%29_90.jpg", "https://ko.wikipedia.org/wiki/황희찬"),
    wiki("p22", "류승룡", "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Ryu_Seung-ryong_in_2025.png/330px-Ryu_Seung-ryong_in_2025.png", "https://ko.wikipedia.org/wiki/류승룡"),
    wiki("p23", "백종원", "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/%EB%B0%B1%EC%A2%85%EC%9B%90_%ED%95%9C%EB%8F%88_%EC%B6%94%EC%B6%9C.png/330px-%EB%B0%B1%EC%A2%85%EC%9B%90_%ED%95%9C%EB%8F%88_%EC%B6%94%EC%B6%9C.png", "https://ko.wikipedia.org/wiki/백종원"),
    wiki("p24", "나영석", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/160415_%EB%82%98%EC%98%81%EC%84%9D.png/330px-160415_%EB%82%98%EC%98%81%EC%84%9D.png", "https://ko.wikipedia.org/wiki/나영석"),
    wiki("p25", "기안84", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/190102_%EA%B8%B0%EC%95%8884_%281%29.jpg/330px-190102_%EA%B8%B0%EC%95%8884_%281%29.jpg", "https://ko.wikipedia.org/wiki/기안84"),
    wiki("p26", "안유진", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/181029_IZ%2AONE_Yujin_02.png/330px-181029_IZ%2AONE_Yujin_02.png", "https://ko.wikipedia.org/wiki/안유진"),
    wiki("p27", "장원영", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Jang_Won-young_at_the_Bulgari_HDD_Seoul%2C_December_4%2C_2025.png/330px-Jang_Won-young_at_the_Bulgari_HDD_Seoul%2C_December_4%2C_2025.png", "https://ko.wikipedia.org/wiki/장원영"),
    wiki("p28", "차은우", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/240301_Cha_Eun-woo.jpg/330px-240301_Cha_Eun-woo.jpg", "https://ko.wikipedia.org/wiki/차은우"),
    wiki("p29", "김고은", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Kim_Go-eun_at_the_2024_Toronto_International_Film_Festival_%28cropped%29.jpg/330px-Kim_Go-eun_at_the_2024_Toronto_International_Film_Festival_%28cropped%29.jpg", "https://ko.wikipedia.org/wiki/김고은"),
    wiki("p30", "손예진", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Son_Ye-jin_%EC%86%90%EC%98%88%EC%A7%84_2024_02.jpg/330px-Son_Ye-jin_%EC%86%90%EC%98%88%EC%A7%84_2024_02.jpg", "https://ko.wikipedia.org/wiki/손예진"),
    wiki("p31", "박서준", "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Park_Seo-joon_for_Marie_Claire_Korea%2C_2023_%282%29.jpg/330px-Park_Seo-joon_for_Marie_Claire_Korea%2C_2023_%282%29.jpg", "https://ko.wikipedia.org/wiki/박서준"),
    wiki("p32", "찰리 채플린", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Charlie_Chaplin_portrait_Getty_1739411952.jpg/330px-Charlie_Chaplin_portrait_Getty_1739411952.jpg", "https://ko.wikipedia.org/wiki/찰리_채플린"),
    wiki("p33", "마이클 잭슨", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Michael_Jackson_in_1988.jpg/330px-Michael_Jackson_in_1988.jpg", "https://ko.wikipedia.org/wiki/마이클_잭슨")
  ],
  character: [
    wiki("c01", "팅커벨", "https://upload.wikimedia.org/wikipedia/commons/4/42/Tinkclose-1-.jpg", "https://en.wikipedia.org/wiki/Tinker_Bell"),
    wiki("c02", "셜록 홈즈", "https://upload.wikimedia.org/wikipedia/commons/c/cd/Sherlock_Holmes_Portrait_Paget.jpg", "https://en.wikipedia.org/wiki/Sherlock_Holmes"),
    wiki("c03", "피노키오", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Pinocchio.jpg/330px-Pinocchio.jpg", "https://en.wikipedia.org/wiki/Pinocchio"),
    wiki("c04", "도로시", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Dorothy_Gale_with_silver_shoes.jpg/330px-Dorothy_Gale_with_silver_shoes.jpg", "https://en.wikipedia.org/wiki/Dorothy_Gale"),
    wiki("c05", "프랑켄슈타인", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Christie%27s_auction_scan_of_Frankenstein_1818.jpg/330px-Christie%27s_auction_scan_of_Frankenstein_1818.jpg", "https://en.wikipedia.org/wiki/Frankenstein"),
    wiki("c06", "이상한 나라의 앨리스", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Alice_par_John_Tenniel_04.png/330px-Alice_par_John_Tenniel_04.png", "https://en.wikipedia.org/wiki/Alice_(Alice%27s_Adventures_in_Wonderland)"),
    wiki("c07", "뽀빠이", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Popeye_transparent.png/330px-Popeye_transparent.png", "https://en.wikipedia.org/wiki/Popeye"),
    wiki("c08", "곰돌이 푸", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Pooh_Shepard1928.jpg/330px-Pooh_Shepard1928.jpg", "https://en.wikipedia.org/wiki/Winnie-the-Pooh")
  ],
  zoom: [
    wiki("z01", "지폐", "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Billets_de_5000.jpg/330px-Billets_de_5000.jpg", "https://ko.wikipedia.org/wiki/지폐"),
    wiki("z02", "수박", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg/330px-Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg", "https://ko.wikipedia.org/wiki/수박"),
    wiki("z03", "김밥", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Gimbap_%28pixabay%29.jpg/330px-Gimbap_%28pixabay%29.jpg", "https://ko.wikipedia.org/wiki/김밥"),
    wiki("z04", "이어폰", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/S%C5%82uchawki_referencyjne_K-701_firmy_AKG.jpg/330px-S%C5%82uchawki_referencyjne_K-701_firmy_AKG.jpg", "https://en.wikipedia.org/wiki/Headphones"),
    wiki("z05", "안경", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/2023_Okulary_korekcyjne.jpg/330px-2023_Okulary_korekcyjne.jpg", "https://en.wikipedia.org/wiki/Glasses"),
    wiki("z06", "신용카드", "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Credit-cards.jpg/330px-Credit-cards.jpg", "https://en.wikipedia.org/wiki/Credit_card"),
    wiki("z07", "바나나", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Bananavarieties.jpg/330px-Bananavarieties.jpg", "https://en.wikipedia.org/wiki/Banana"),
    wiki("z08", "라면", "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Mama_instant_noodle_block.jpg/330px-Mama_instant_noodle_block.jpg", "https://en.wikipedia.org/wiki/Instant_noodles"),
    wiki("z09", "햄버거", "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/RedDot_Burger.jpg/330px-RedDot_Burger.jpg", "https://en.wikipedia.org/wiki/Hamburger"),
    wiki("z10", "초밥", "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Sushi_platter.jpg/330px-Sushi_platter.jpg", "https://en.wikipedia.org/wiki/Sushi")
  ]
};

export function getVerifiedImage(id: string) {
  return Object.values(VERIFIED_IMAGES).flat().find((item) => item.id === id);
}
