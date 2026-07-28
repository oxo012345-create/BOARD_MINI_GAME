export type GemAssetKind = "locations" | "items" | "tools" | "traits" | "alibis" | "questions" | "scenes";

const GEM_ASSET_FALLBACKS: Record<GemAssetKind, string> = {
  locations: "/gem-case-scene.webp",
  items: "/gem-evidence.webp",
  tools: "/gem-evidence.webp",
  traits: "/gem-suspects.webp",
  alibis: "/gem-alibi.webp",
  questions: "/gem-question.webp",
  scenes: "/gem-case-scene.webp",
};

export const GEM_ASSET_COUNTS = {
  locations: 20,
  items: 20,
  tools: 20,
  traits: 30,
  alibis: 20,
  questions: 50,
  scenes: 30,
};

export function gemAsset(kind: GemAssetKind, id?: string) {
  return id && /^[a-z0-9-]+$/.test(id)
    ? `/gem-heist/${kind}/${id}.webp`
    : GEM_ASSET_FALLBACKS[kind];
}
