export const PLACE_MAFIA_LOCATION_IDS = ["residential", "police", "square", "park", "alley", "hospital"] as const;

export type PlaceMafiaLocationId = typeof PLACE_MAFIA_LOCATION_IDS[number];
export type PlaceMafiaRole = "citizen" | "mafia";
export type PlaceMafiaWinner = "citizen" | "mafia";
export type PlaceMafiaBalance = "citizen" | "normal" | "mafia";
export type PlaceMafiaPhase = "role_reveal" | "night" | "day_reveal" | "discussion" | "vote" | "execution" | "game_over";

export const PLACE_MAFIA_GRAPH: Record<PlaceMafiaLocationId, PlaceMafiaLocationId[]> = {
  residential: ["police", "square"],
  police: ["residential", "park"],
  square: ["residential", "park", "alley"],
  park: ["police", "square", "hospital"],
  alley: ["square", "hospital"],
  hospital: ["park", "alley"],
};

export const PLACE_MAFIA_SPECIAL_LOCATIONS = new Set<PlaceMafiaLocationId>(["police", "square", "hospital"]);

export const PLACE_MAFIA_LOCATION_META: Record<PlaceMafiaLocationId, {
  name: string;
  shortName: string;
  symbol: string;
  kind: "police" | "square" | "hospital" | "neutral";
  effect: string;
}> = {
  police: { name: "경찰서", shortName: "경찰", symbol: "POL", kind: "police", effect: "살인 성공 시 범인 위치 후보 3곳 공개" },
  square: { name: "광장", shortName: "광장", symbol: "SQ", kind: "square", effect: "지난밤 방문자 명단 전체 공개" },
  hospital: { name: "병원", shortName: "병원", symbol: "MED", kind: "hospital", effect: "외부 장소에서 들어오는 공격 방어" },
  residential: { name: "주택가", shortName: "주택", symbol: "HOME", kind: "neutral", effect: "조용한 주거 구역" },
  park: { name: "공원", shortName: "공원", symbol: "PARK", kind: "neutral", effect: "도시 중앙의 이동 허브" },
  alley: { name: "골목", shortName: "골목", symbol: "ALLEY", kind: "neutral", effect: "어둡고 좁은 우회로" },
};

export type PlaceMafiaPublicNight = {
  day: number;
  quiet: boolean;
  message: string;
  victimId?: string;
  incidentLocation?: PlaceMafiaLocationId;
  plazaVisitorIds: string[];
  policeCandidates: PlaceMafiaLocationId[];
};

export type PlaceMafiaExecution = {
  day: number;
  tied: boolean;
  playerId?: string;
  role?: PlaceMafiaRole;
  message: string;
};

export type PlaceMafiaClientState = {
  phase: PlaceMafiaPhase;
  day: number;
  phaseEndsAt?: number;
  settings: {
    discussionSeconds: 60 | 90 | 120;
    balance: PlaceMafiaBalance;
  };
  participantIds: string[];
  alivePlayerIds: string[];
  deadPlayerIds: string[];
  revealedRoles: Record<string, PlaceMafiaRole>;
  roleReadyCount: number;
  voteSubmittedCount: number;
  lastDiscussionCut?: { playerId: string; at: number };
  night?: PlaceMafiaPublicNight;
  execution?: PlaceMafiaExecution;
  winner?: PlaceMafiaWinner;
  finalRoles?: Record<string, PlaceMafiaRole>;
  my?: {
    role: PlaceMafiaRole;
    roleReady: boolean;
    alive: boolean;
    location: PlaceMafiaLocationId;
    legalMoves: PlaceMafiaLocationId[];
    selectedMove?: PlaceMafiaLocationId;
    moveConfirmed: boolean;
    witnessIds: string[];
    teammateIds: string[];
    activeKillerId?: string;
    isKiller: boolean;
    requiredAttackCount: 0 | 1 | 2;
    legalAttackLocations: PlaceMafiaLocationId[];
    selectedAttackLocations: PlaceMafiaLocationId[];
    attackConfirmed: boolean;
    discussionCutUsed: boolean;
    voteSubmitted: boolean;
  };
};

export function placeMafiaLocationName(id?: PlaceMafiaLocationId) {
  return id ? PLACE_MAFIA_LOCATION_META[id].name : "알 수 없는 장소";
}
