import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const nodeCompatFlag = ["nodejs", "_compat"].join("");
const isLocalDevServer = process.argv.some((value) => value === "dev" || value === "serve");
const useLocalCompatibility = isLocalDevServer;
const compatibilityDate = useLocalCompatibility ? "2026-05-15" : "2026-08-04";
const localPersistPath = process.env.HANPAN_LOCAL_PERSIST_PATH?.trim();

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  // Cloudflare enables Node.js compatibility by default from this date onward.
  // Keeping the date explicit makes local and hosted builds use the same mode.
  compatibility_date: compatibilityDate,
  // Keep the compatibility flag opt-in for local Miniflare only. Sites' hosted
  // Wrangler now enables Node compatibility by default and rejects the legacy
  // flag during its production validation.
  ...(useLocalCompatibility ? { compatibility_flags: [nodeCompatFlag] } : {}),
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
      {
        name: "SIEGE_ROOMS",
        class_name: "SiegeRoom",
      },
      // Milestone 0 spike for the 공성전 tick loop. Remove with worker/spike-room.ts.
      {
        name: "SPIKE_ROOMS",
        class_name: "SpikeRoom",
      },
    ],
  },
  migrations: [
    {
      tag: "maze-room-v1",
      new_sqlite_classes: ["MazeRoom"],
    },
    {
      tag: "siege-room-v1",
      new_sqlite_classes: ["SiegeRoom"],
    },
    {
      tag: "spike-room-v1",
      new_sqlite_classes: ["SpikeRoom"],
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
        // Browser/API integration tests may run while a developer already has
        // `npm run dev` open. Giving those test servers an isolated Miniflare
        // directory prevents both processes from locking the same local D1.
        ...(localPersistPath ? { persistState: { path: localPersistPath } } : {}),
      }),
    ],
  };
});
