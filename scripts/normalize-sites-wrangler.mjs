import fs from "node:fs";

const wranglerPath = "dist/server/wrangler.json";

if (process.env.SITES_DEPLOY !== "1" || !fs.existsSync(wranglerPath)) {
  process.exit(0);
}

const config = JSON.parse(fs.readFileSync(wranglerPath, "utf8"));
// Cloudflare enables the Node compatibility runtime by default after
// 2026-08-04 and rejects an explicit (or empty) compatibility_flags field.
delete config.compatibility_flags;
fs.writeFileSync(wranglerPath, `${JSON.stringify(config)}\n`);
