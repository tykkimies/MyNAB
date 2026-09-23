import "dotenv/config";
import { createInterface } from "node:readline/promises";
import {
  createOwner,
  resetOwnerPassword,
  AuthError,
} from "../src/application/auth";
import { getDb } from "../src/infrastructure/db";
import { getConfig } from "../src/infrastructure/config";

async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Interactive terminal required");
  process.stdout.write(label);
  const previous = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(previous);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (buffer: Buffer) => {
      for (const char of buffer.toString("utf8")) {
        if (char === "\u0003" || char === "\u0004") {
          cleanup();
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b")
          value = [...value].slice(0, -1).join("");
        else if (char >= " " && value.length < 129) value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
try {
  getConfig();
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Interactive terminal required");
  const command = process.argv[2];
  if (!["create", "reset"].includes(command) || process.argv.length !== 3)
    throw new Error(
      "Use owner:create or owner:reset without password arguments",
    );
  let username = "";
  if (command === "create") {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    username = await rl.question("Owner username (3–64 letters/digits/._-): ");
    rl.close();
  }
  const password = await hiddenPrompt(
    "Passphrase (15–128 characters, hidden): ",
  );
  const confirmation = await hiddenPrompt("Repeat passphrase: ");
  if (password !== confirmation) throw new Error("Passphrases do not match");
  if (command === "create") await createOwner(username, password);
  else await resetOwnerPassword(password);
  console.log(
    command === "create"
      ? "Owner and budget created."
      : "Password reset; all sessions revoked.",
  );
} catch (error) {
  if (error instanceof AuthError) console.error(`Owner command: ${error.code}`);
  else
    console.error(
      "Owner command failed. Check configuration, database access, username, and matching 15–128 character passphrases.",
    );
  process.exitCode = 1;
} finally {
  try {
    await getDb().$disconnect();
  } catch {
    /* Configuration may have failed before connecting. */
  }
}
