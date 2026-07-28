export function withSubjectParticle(value) {
  const lastCharacter = [...value].at(-1) ?? "";
  const codePoint = lastCharacter.charCodeAt(0);
  const hasFinalConsonant = codePoint >= 0xac00 && codePoint <= 0xd7a3 && (codePoint - 0xac00) % 28 !== 0;
  return `${value}${hasFinalConsonant ? "이" : "가"}`;
}
