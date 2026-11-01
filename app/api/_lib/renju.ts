/** RIF §§3, 4.2, 9.1–9.3. Casual opening: black starts at centre;
 * tournament opening/swap procedures are deliberately separate from this ruleset. */
export type Forbidden = '장목' | '사사' | '삼삼';
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
function offset(cell: number, dx: number, dy: number, n: number) {
  const x = cell % 15 + dx * n, y = Math.floor(cell / 15) + dy * n;
  return x < 0 || x >= 15 || y < 0 || y >= 15 ? -1 : y * 15 + x;
}
function run(board: number[], cell: number, dx: number, dy: number, color = 1) {
  let length = 1;
  for (const sign of [-1, 1]) for (let n = 1; n < 15; n++) {
    const i = offset(cell, dx, dy, n * sign);
    if (i < 0 || board[i] !== color) break;
    length++;
  }
  return length;
}
function lengths(board: number[], cell: number, color = 1) { return DIRS.map(([dx, dy]) => run(board, cell, dx, dy, color)); }

// Identify the four stones, not their winning endpoints. Two fours can share a direction.
function fours(board: number[], cell: number) {
  const found = new Set<string>();
  for (const [dx, dy] of DIRS) for (let start = -4; start <= 0; start++) {
    const cells = Array.from({ length: 5 }, (_, n) => offset(cell, dx, dy, start + n));
    if (cells.some(i => i < 0 || board[i] === 2)) continue;
    const empty = cells.filter(i => !board[i]);
    if (empty.length !== 1) continue;
    board[empty[0]] = 1;
    const exact = run(board, empty[0], dx, dy) === 5;
    board[empty[0]] = 0;
    if (exact) found.add(cells.filter(i => i !== empty[0]).sort((a, b) => a - b).join(','));
  }
  return found.size;
}

/** Board already contains the candidate black stone. Each recursive call adds
 * a stone, so the false-three search is finite; memoization shares continuations. */
function blackResult(board: number[], cell: number, memo: Map<string, Forbidden | null>): Forbidden | null {
  const key = cell + ':' + board.join('');
  if (memo.has(key)) return memo.get(key)!;
  const lines = lengths(board, cell);
  if (lines.includes(5)) { memo.set(key, null); return null; } // Exact five takes precedence (§9.2).
  if (lines.some(n => n > 5)) { memo.set(key, '장목'); return '장목'; }
  if (fours(board, cell) > 1) { memo.set(key, '사사'); return '사사'; }
  const candidates = new Map<string, Set<number>>();
  for (const [dx, dy] of DIRS) for (let start = -3; start <= 0; start++) {
    const cells = Array.from({ length: 4 }, (_, n) => offset(cell, dx, dy, start + n));
    const left = offset(cell, dx, dy, start - 1), right = offset(cell, dx, dy, start + 4);
    if (left < 0 || right < 0 || board[left] || board[right] || cells.some(i => i < 0 || board[i] === 2)) continue;
    const empty = cells.filter(i => !board[i]);
    if (empty.length !== 1) continue;
    const extension = empty[0]; board[extension] = 1;
    // An open four needs TWO exact-five ends, and creating it must not already win.
    const straight = run(board, left, dx, dy) === 5 && run(board, right, dx, dy) === 5;
    const wins = lengths(board, extension).includes(5);
    board[extension] = 0;
    if (!straight || wins) continue;
    const group = cells.filter(i => i !== extension).sort((a, b) => a - b).join(',');
    if (!candidates.has(group)) candidates.set(group, new Set());
    candidates.get(group)!.add(extension);
  }
  let genuine = 0;
  if (candidates.size > 1) for (const extensions of candidates.values()) {
    let valid = false;
    for (const extension of extensions) {
      board[extension] = 1;
      valid = blackResult(board, extension, memo) === null;
      board[extension] = 0;
      if (valid) break;
    }
    if (valid && ++genuine > 1) { memo.set(key, '삼삼'); return '삼삼'; }
  }
  memo.set(key, null); return null;
}

export function forbiddenBlackMoves(input: number[]): Map<number, Forbidden> {
  const result = new Map<number, Forbidden>();
  if (input.filter(n => n === 1).length < 4) return result;
  const board = [...input], memo = new Map<string, Forbidden | null>();
  for (let cell = 0; cell < 225; cell++) if (!board[cell]) {
    board[cell] = 1;
    const reason = blackResult(board, cell, memo);
    board[cell] = 0;
    if (reason) result.set(cell, reason);
  }
  return result;
}

export function renjuMove(input: number[], cell: number, color: number): { legal: boolean; win: boolean; reason?: string } {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 225 || input[cell]) return { legal: false, win: false, reason: '빈 교차점을 선택해 주세요.' };
  if (!input.some(Boolean) && (color !== 1 || cell !== 112)) return { legal: false, win: false, reason: '흑의 첫 수는 중앙 H8에 놓아 주세요.' };
  const board = [...input]; board[cell] = color;
  const lines = lengths(board, cell, color);
  const forbidden = color === 1 ? blackResult(board, cell, new Map()) : null;
  return forbidden ? { legal: false, win: false, reason: `흑 ${forbidden} 금수에는 놓을 수 없어요.` } : { legal: true, win: color === 1 ? lines.includes(5) : lines.some(n => n >= 5) };
}
