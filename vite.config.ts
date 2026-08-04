import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const nodeCompatFlag = ["nodejs", "_compat"].join("");
const nodeCompatV2Flag = ["nodejs", "_compat", "_v2"].join("");
const isLocalDevServer = process.argv.some((value) => value === "dev" || value === "serve");
const compatibilityDate = isLocalDevServer ? "2026-05-15" : "2026-08-04";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  // Cloudflare enables Node.js compatibility by default from this date onward.
  // Keeping the date explicit makes local and hosted builds use the same mode.
  compatibility_date: compatibilityDate,
  // The current hosted Wrangler rejects the legacy nodejs_compat spelling;
  // use the explicit v2 flag for production while keeping local Miniflare's
  // supported flag for the dev server.
  compatibility_flags: [isLocalDevServer ? nodeCompatFlag : nodeCompatV2Flag],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
  durable_objects: {
    bindings: [
      {
        name: "MAZE_ROOMS",
        class_name: "MazeRoom",
      },
    ],
  },
  migrations: [
    {
      tag: "maze-room-v1",
      new_sqlite_classes: ["MazeRoom"],
    },
  ],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
