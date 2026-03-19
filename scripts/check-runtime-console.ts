import { spawnSync } from "node:child_process";

const RUNTIME_DIRECTORIES = [
  "apps/api/src",
  "apps/platform/src",
  "apps/verify/src",
  "infra/face-matcher/src",
  "packages/auth/src",
] as const;

const result = spawnSync(
  "rg",
  [
    "-n",
    "console\\.(debug|error|info|log|warn)\\s*\\(",
    ...RUNTIME_DIRECTORIES,
  ],
  {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  }
);

if (result.status === 1) {
  process.exit(0);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

process.stderr.write(
  [
    "Direct runtime console usage is not allowed.",
    "",
    result.stdout.trim(),
    "",
    "Use the shared logging helpers instead.",
  ].join("\n")
);
process.exit(1);
