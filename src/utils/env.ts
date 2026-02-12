import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ENV_LOCAL_FILENAME = ".env.local";

export async function loadEnvForCli(argv: string[]): Promise<void> {
  const roots: string[] = [process.cwd()];
  const argvRoot = resolvePathFromArgv(argv);
  if (argvRoot && !roots.includes(argvRoot)) {
    roots.push(argvRoot);
  }

  for (const rootPath of roots) {
    await loadEnvLocal(rootPath);
  }
}

export function resolvePathFromArgv(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--path" || token === "-p") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) return undefined;
      return resolve(value);
    }

    if (token.startsWith("--path=")) {
      const value = token.slice("--path=".length);
      if (!value) return undefined;
      return resolve(value);
    }
  }

  return undefined;
}

export async function loadEnvLocal(rootPath: string): Promise<void> {
  const envPath = join(rootPath, ENV_LOCAL_FILENAME);
  let content = "";

  try {
    content = await readFile(envPath, "utf-8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/u)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const { key, value } = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const normalized = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;

  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex <= 0) return null;

  const key = normalized.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) return null;

  let rawValue = normalized.slice(equalsIndex + 1).trim();

  if ((rawValue.startsWith("\"") && rawValue.endsWith("\""))
    || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
    rawValue = rawValue.slice(1, -1);
  } else {
    const commentIndex = rawValue.indexOf(" #");
    if (commentIndex >= 0) {
      rawValue = rawValue.slice(0, commentIndex).trim();
    }
  }

  return { key, value: rawValue };
}
