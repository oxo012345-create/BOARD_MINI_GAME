import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const layout = readFileSync(join(root, "app", "layout.tsx"), "utf8");
const css = readFileSync(join(root, "app", "frontier-beans-v11.css"), "utf8");

function pngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${path} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("Frontier Beans loads exactly one isolated runtime stylesheet", () => {
  assert.match(layout, /import "\.\/frontier-beans-v11\.css";/);
  assert.doesNotMatch(layout, /import "\.\/frontier-beans\.css";/);
  assert.ok(existsSync(join(root, "app", "frontier-beans.css")), "legacy CSS remains archived in source, but must not be imported");
});

test("3, 4 and 5 player shells use explicit slots in one logical board", () => {
  for (const count of [3, 4, 5]) {
    assert.match(css, new RegExp(`\\.fb3-game\\.players-${count} \\{ background-image:`));
  }
  assert.match(css, /aspect-ratio:\s*393\s*\/\s*664/);
  assert.match(css, /\.fb3-game \.fb3-own-fields\.fields-3/);
  assert.match(css, /\.fb3-game \.fb3-own-field > button:first-of-type \{ overflow: visible; \}/);
  assert.match(css, /\.fb3-game \.fb3-tree img \{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;/);
});

test("all 24 field sprites share one normalized 256px canvas", () => {
  const beanTypes = ["azure", "copper", "forest", "honey", "ivory", "midnight", "roast", "ruby"];
  const stages = ["low", "mid", "high"];
  for (const type of beanTypes) {
    for (const stage of stages) {
      const path = join(root, "public", "frontier-beans", "fields", `bean-${type}-${stage}.png`);
      assert.ok(existsSync(path), `missing ${type}-${stage} field sprite`);
      assert.deepEqual(pngSize(path), { width: 256, height: 256 });
    }
  }
});

test("interactive board artwork is not dimmed merely because an action is unavailable", () => {
  assert.match(css, /\.fb3-game \.fb3-player:disabled,[\s\S]*?opacity:\s*1/);
  assert.match(css, /\.fb3-game \.fb3-own-field > button:disabled[\s\S]*?opacity:\s*1/);
});
