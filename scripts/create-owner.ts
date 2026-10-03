/**
 * Creates the single Tenth owner account.
 *
 *   npm run owner:create                         # interactive: prompts for name and password (hidden, confirmed)
 *   OWNER_PASSWORD=... npm run owner:create      # non-interactive (CI / Render shell)
 *   npm run owner:create -- --name "Josh"        # name without prompting
 *
 * The email is always OWNER_EMAIL. Reads .env.local when present (without overriding variables already set).
 * Runs with `tsx --conditions=react-server` so modules guarded by `import "server-only"` load outside Next.js.
 * Migrations must be applied first (`npm run db:migrate`).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(flag);
  if (i !== -1) return argv[i + 1];
  const prefixed = argv.find((a) => a.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

async function promptVisible(question: string, fallback: string): Promise<string> {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [${fallback}]: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

/** Reads a line from the TTY without echoing it. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return Promise.reject(new Error("No terminal available for a password prompt. Set OWNER_PASSWORD instead."));
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.OWNER_PASSWORD;
  if (fromEnv) return fromEnv;
  const first = await promptHidden("Password (12-128 characters): ");
  const second = await promptHidden("Confirm password: ");
  if (first !== second) throw new Error("The passwords do not match.");
  return first;
}

async function main(): Promise<number> {
  const envFile = join(root, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const email = process.env.OWNER_EMAIL?.trim();
  if (!email) throw new Error("OWNER_EMAIL is not set. It is the only email allowed to own this Tenth.");

  // Imported after the environment is loaded (the modules read env lazily, but keep the order obvious).
  const { createOwnerAccount, ownerExists } = await import("../src/server/auth/owner");
  const { closeDb } = await import("../src/server/db/client");
  try {
    if (await ownerExists()) {
      console.error("An owner account already exists. Nothing to do.");
      return 1;
    }
    const name = argValue("--name")?.trim() || (await promptVisible("Your name", "Owner"));
    const password = await readPassword();
    const result = await createOwnerAccount({ email, name, password });
    if (!result.ok) {
      const details = result.fieldErrors ? Object.values(result.fieldErrors).join(" ") : result.message;
      console.error(`Could not create the owner: ${details}`);
      return 1;
    }
    console.log("Owner account created. Sign in at /sign-in with OWNER_EMAIL and your password.");
    return 0;
  } finally {
    await closeDb();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unexpected error.");
    process.exit(1);
  });
