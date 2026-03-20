import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const EXCLUDED_PATH_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".wrangler",
  "node_modules",
]);

const parseArgs = (argv) => {
  const result = {
    extraPaths: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    switch (argument) {
      case "--project-dir":
        result.projectDir = value;
        index += 1;
        break;
      case "--artifact-dir":
        result.artifactDir = value;
        index += 1;
        break;
      case "--extra-path":
        result.extraPaths.push(value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!(result.projectDir && result.artifactDir)) {
    throw new Error("Expected --project-dir and --artifact-dir.");
  }

  return result;
};

const parseJson = (source) => JSON.parse(source);

const shouldCopyPath = (sourcePath) => {
  const pathName = path.basename(sourcePath);

  if (pathName.startsWith(".env")) {
    return false;
  }

  return !EXCLUDED_PATH_NAMES.has(pathName);
};

const pruneWorkspaceProjectDir = async (workspaceProjectDir) => {
  await rm(path.join(workspaceProjectDir, ".DS_Store"), {
    force: true,
    recursive: true,
  });
  await rm(path.join(workspaceProjectDir, ".wrangler"), {
    force: true,
    recursive: true,
  });
  await rm(path.join(workspaceProjectDir, "node_modules"), {
    force: true,
    recursive: true,
  });

  for (const entry of await readdir(workspaceProjectDir)) {
    if (entry.startsWith(".env")) {
      await rm(path.join(workspaceProjectDir, entry), {
        force: true,
        recursive: true,
      });
    }
  }
};

const main = async () => {
  const { artifactDir, extraPaths, projectDir } = parseArgs(
    process.argv.slice(2)
  );
  const repoRoot = process.cwd();
  const absoluteArtifactDir = path.resolve(repoRoot, artifactDir);
  const absoluteProjectDir = path.resolve(repoRoot, projectDir);
  const workspaceRoot = path.join(absoluteArtifactDir, "workspace");
  const workspaceProjectDir = path.join(workspaceRoot, projectDir);
  const configPath = path.join(absoluteProjectDir, "wrangler.jsonc");
  const deployConfigPath = path.join(
    workspaceProjectDir,
    "wrangler.deploy.jsonc"
  );

  await rm(absoluteArtifactDir, { force: true, recursive: true });
  await mkdir(workspaceRoot, { recursive: true });

  await cp(absoluteProjectDir, workspaceProjectDir, {
    filter: shouldCopyPath,
    recursive: true,
  });
  await pruneWorkspaceProjectDir(workspaceProjectDir);

  for (const extraPath of extraPaths) {
    const absoluteExtraPath = path.resolve(repoRoot, extraPath);
    const workspaceExtraPath = path.join(workspaceRoot, extraPath);

    await mkdir(path.dirname(workspaceExtraPath), { recursive: true });
    await cp(absoluteExtraPath, workspaceExtraPath, {
      filter: shouldCopyPath,
      recursive: true,
    });
  }

  const configSource = await readFile(configPath, "utf8");
  const deployConfig = parseJson(configSource);
  const { $schema: _schema, ...configForDeploy } = deployConfig;

  await writeFile(
    deployConfigPath,
    `${JSON.stringify(
      { ...configForDeploy, main: "./.wrangler-out/index.js" },
      null,
      2
    )}\n`,
    "utf8"
  );
};

await main();
