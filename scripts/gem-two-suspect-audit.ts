import { gemCandidateIds, makeRound, validateGemRound, type GemDifficulty } from "../app/api/_lib/rounds";
import type { Player } from "../app/api/_lib/rooms";

const difficulties: GemDifficulty[] = ["easy", "normal", "hard"];
const iterations = Number(process.env.GEM_AUDIT_ITERATIONS ?? 2_000);
let generated = 0;
const failures: string[] = [];

for (let playerCount = 4; playerCount <= 8; playerCount += 1) {
  const players: Player[] = Array.from({ length: playerCount }, (_, index) => ({
    id: `p${index + 1}`,
    name: `플레이어${index + 1}`,
    avatar: "🙂",
    joinedAt: index,
    lastSeen: index,
    sessionHash: `session-${index + 1}`,
    status: "active",
  }));

  for (const difficulty of difficulties) {
    for (const specialRoles of [false, true]) {
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const round = makeRound("gem-heist", players, "normal", undefined, specialRoles, difficulty);
        generated += 1;
        if (!round) {
          failures.push(`${playerCount}명/${difficulty}/특수역할 ${specialRoles}: 사건 생성 실패`);
          continue;
        }
        const errors = validateGemRound(round, players);
        const candidates = gemCandidateIds(round);
        const candidateSet = new Set(candidates);
        const finalSet = new Set(round.gemSolution?.finalSuspectIds ?? []);
        if (errors.length) failures.push(`${playerCount}명/${difficulty}/특수역할 ${specialRoles}: ${errors.join(" | ")}`);
        if (
          candidates.length !== 2
          || !round.gemThiefId
          || !candidateSet.has(round.gemThiefId)
          || finalSet.size !== 2
          || [...candidateSet].some((id) => !finalSet.has(id))
        ) failures.push(`${playerCount}명/${difficulty}/특수역할 ${specialRoles}: 최종 후보 불일치`);
      }
    }
  }
}

if (failures.length) {
  console.error(`FAIL ${failures.length}/${generated}`);
  console.error(failures.slice(0, 20).join("\n"));
  process.exit(1);
}

console.log(`PASS ${generated} rounds: 4~8명 × 쉬움/보통/어려움 × 특수 역할 꺼짐/켜짐`);
