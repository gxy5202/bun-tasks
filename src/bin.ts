#!/usr/bin/env bun

import { BunTasksCLI } from "./cli";

export { BunTasksCLI };
export type { ParsedInput, RunOptions } from "./cli";

async function main(): Promise<void> {
  const cli = new BunTasksCLI();
  const exitCode = await cli.run(process.argv.slice(2));
  process.exit(exitCode);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
