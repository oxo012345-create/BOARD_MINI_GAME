import fs from "node:fs";

const wranglerPath = "dist/server/wrangler.json";

if (process.env.SITES_DEPLOY !== "1" || !fs.existsSync(wranglerPath)) {
  process.exit(0);
}

const config = JSON.parse(fs.readFileSync(wranglerPath, "utf8"));
// Cloudflare's current hosted Wrangler rejects the legacy nodejs_compat flag
// after 2026-08-04, while nodejs_compat_v2 remains an explicit opt-in.
if (Array.isArray(config.compatibility_flags)) {
  config.compatibility_flags = config.compatibility_flags.filter(
    (flag) => flag !== "nodejs_compat",
  );
  if (config.compatibility_flags.length === 0) delete config.compatibility_flags;
}
fs.writeFileSync(wranglerPath, `${JSON.stringify(config)}\n`);
