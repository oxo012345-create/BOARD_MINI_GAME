import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GAME_CONTENT } from "../app/api/_lib/content-data.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const imageSource = await readFile(new URL("../app/api/_lib/images.ts", import.meta.url), "utf8");
const imageGroups = { people: [], character: [], zoom: [] };
let activeGroup = null;

for (const line of imageSource.split(/\r?\n/)) {
  const groupMatch = line.match(/^\s{2}(people|character|zoom): \[$/);
  if (groupMatch) {
    activeGroup = groupMatch[1];
    continue;
  }
  if (activeGroup && /^\s{2}],?$/.test(line)) {
    activeGroup = null;
    continue;
  }
  if (!activeGroup) continue;
  const itemMatch = line.match(/wiki\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)/);
  if (!itemMatch) continue;
  imageGroups[activeGroup].push({ id: itemMatch[1], answer: itemMatch[2], url: itemMatch[3], source: itemMatch[4] });
}

if (GAME_CONTENT.triviaMedium.length !== 1000) throw new Error("상식퀴즈 카탈로그는 정확히 1000개여야 합니다.");
if (!imageGroups.people.length || !imageGroups.character.length) throw new Error("검수 사진 목록을 읽지 못했습니다.");

const banner = "// 자동 생성 파일입니다. app/api/_lib의 원본 데이터를 수정한 뒤 npm run sync:catalog를 실행하세요.\n";
await writeFile(`${root}content-data.js`, `${banner}window.GAME_CONTENT = ${JSON.stringify(GAME_CONTENT)};\n`, "utf8");
await writeFile(`${root}verified-image-data.js`, `${banner}window.HANPAN_VERIFIED_IMAGES = ${JSON.stringify(imageGroups)};\n`, "utf8");

console.log(`카탈로그 동기화 완료: 상식퀴즈 ${GAME_CONTENT.triviaMedium.length}개, 검수 사진 ${Object.values(imageGroups).flat().length}장`);
