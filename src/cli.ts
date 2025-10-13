#!/usr/bin/env bun

import type { Subprocess } from "bun";
import chalk from "chalk";
import fs from "fs";
import path from "path";

export interface ParsedInput {
  args: string[];
  globalArgs: string[];
  commandTokenGroups: string[][];
  rawOutput: boolean;
}

export interface RunOptions {
  stdoutPrefix?: (index: number) => string;
  mirrorStderrToStdout?: boolean;
}

type SpawnOptionsCompat = {
  cmd: string[];
  stdout?: "pipe" | "inherit" | "ignore";
  stderr?: "pipe" | "inherit" | "ignore";
  env?: Record<string, string>;
};

export class BunTasksCLI {
  static getVersion(): string {
    try {
      const pkgPath: string = path.resolve(
        process.cwd(),
        "node_modules",
        "bun-tasks",
        "package.json"
      );
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        version?: string;
      };
      return pkg.version ?? "unknown";
    } catch {
      try {
        const localPkg = JSON.parse(
          fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")
        ) as { version?: string };
        return localPkg.version ?? "unknown";
      } catch {
        return "unknown";
      }
    }
  }

  static usageText(): string {
    return `
${chalk.bold("bun-tasks")} - Run multiple bun commands in parallel

${chalk.bold("Usage:")}
  bun-tasks [--args|-a key=value] <cmd1> ::: <cmd2> ::: ...

${chalk.bold("Options:")}
  --args, -a <key=value>   Global args passed to all commands
  --version, -v            Show version
  --help, -h               Show this help message
  --raw, -r                Stream child output directly (preserves native progress)

${chalk.bold("Per-command args:")}
  You can add --args after a specific command to override global args
  Example:
    bun-tasks --args NODE_ENV=dev dev -a DEBUG=true ::: serve

${chalk.bold("Examples:")}
  bun-tasks dev ::: serve
  bun-tasks bun run dev ::: bun run serve
  bun-tasks --args NODE_ENV=dev dev ::: serve
  bun-tasks --args NODE_ENV=dev dev --args DEBUG=true ::: serve
  bun-tasks --raw parcel watch src/index.html ::: bun run serve
`;
  }

  printHelp(): never {
    console.log(BunTasksCLI.usageText());
    process.exit(0);
  }

  printVersion(): never {
    console.log(BunTasksCLI.getVersion());
    process.exit(0);
  }

  readPkgScripts(): Record<string, string> {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")
      ) as { scripts?: Record<string, string> };
      return pkg.scripts ?? {};
    } catch {
      return {};
    }
  }

  parse(argv: string[]): ParsedInput {
    // help/version early exits
    if (argv.includes("--help") || argv.includes("-h")) this.printHelp();
    if (argv.includes("--version") || argv.includes("-v")) this.printVersion();

    let globalArgs: string[] = [];
    let rawOutput = false;
    let index = 0;
    const isFlag = (t: string | undefined) =>
      !!t && (t.startsWith("--") || (t.startsWith("-") && t.length > 1));

    while (index < argv.length) {
      const token = argv[index];
      if (token === "--raw" || token === "-r") {
        rawOutput = true;
        index += 1;
        continue;
      }
      if (token === "--args" || token === "-a") {
        const next = argv[index + 1];
        if (next && !isFlag(next)) {
          globalArgs = next.split(" ");
          index += 2;
        } else {
          index += 1;
        }
        continue;
      }
      break;
    }

    const rawCmdTokens = argv.slice(index);
    const commandTokenGroups: string[][] = [];
    let current: string[] = [];
    for (const token of rawCmdTokens) {
      if (token === ":::") {
        if (current.length) commandTokenGroups.push(current);
        current = [];
      } else {
        current.push(token);
      }
    }
    if (current.length) commandTokenGroups.push(current);

    return { args: argv, globalArgs, commandTokenGroups, rawOutput };
  }

  async run(argv: string[], options: RunOptions = {}): Promise<number> {
    const { globalArgs, commandTokenGroups, rawOutput } = this.parse(argv);

    if (commandTokenGroups.length === 0) {
      this.printHelp();
    }

    const pkgScripts = this.readPkgScripts();
    const processes: Array<Promise<number>> = [];

    commandTokenGroups.forEach((partsAll: string[], idx: number): void => {
      let localArgs: string[] = [];
      let parts: string[] = partsAll.slice();
      let argsIndex: number = parts.indexOf("--args");
      if (argsIndex === -1) argsIndex = parts.indexOf("-a");

      if (argsIndex !== -1) {
        localArgs = parts
          .slice(argsIndex + 1)
          .join(" ")
          .split(" ");
        parts = parts.slice(0, argsIndex);
      }

      let [main, ...rest] = parts as [string, ...string[]] | [];
      if (!main) return;

      if (
        !main.startsWith("bun") &&
        Object.prototype.hasOwnProperty.call(pkgScripts, main)
      ) {
        rest = [main, ...rest];
        main = "bun";
        rest = ["run", ...rest];
      }

      const finalArgs: string[] = [...rest, ...globalArgs, ...localArgs];
      const env: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      );
      if (process.stdout.isTTY && env.FORCE_COLOR === undefined) {
        env.FORCE_COLOR = "1";
      }

      const spawnOptions: SpawnOptionsCompat = {
        cmd: [main, ...finalArgs],
        stdout: rawOutput ? "inherit" : "pipe",
        stderr: rawOutput ? "inherit" : "pipe",
        env,
      };
      const proc: Subprocess = (
        Bun.spawn as unknown as (opts: SpawnOptionsCompat) => Subprocess
      )(spawnOptions);

      if (rawOutput) {
        processes.push(proc.exited);
        return;
      }

      const prefix: string = options.stdoutPrefix
        ? options.stdoutPrefix(idx)
        : chalk.cyan(`[${idx + 1}]`);

      // Use TextDecoder to convert Uint8Array chunks to string
      const stdoutDecoder = new TextDecoder();
      const pipePromises: Promise<any>[] = [];
      if (proc.stdout && typeof proc.stdout !== "number") {
        const p = proc.stdout.pipeTo(
          new WritableStream<Uint8Array>({
            write(chunk: Uint8Array) {
              process.stdout.write(prefix + " " + stdoutDecoder.decode(chunk));
            },
          })
        );
        pipePromises.push(p);
      }

      const stderrDecoder = new TextDecoder();
      if (proc.stderr && typeof proc.stderr !== "number") {
        const p = proc.stderr.pipeTo(
          new WritableStream<Uint8Array>({
            write(chunk: Uint8Array) {
              const text = prefix + " " + stderrDecoder.decode(chunk);
              process.stderr.write(text);
              if (options.mirrorStderrToStdout) {
                process.stdout.write(text);
              }
            },
          })
        );
        pipePromises.push(p);
      }

      if (pipePromises.length > 0) {
        processes.push(
          proc.exited.then(async (code) => {
            await Promise.allSettled(pipePromises);
            return code;
          })
        );
      } else {
        processes.push(proc.exited);
      }
    });

    const codes = await Promise.all(processes);
    const failed = codes.find((c: number) => c !== 0) ?? 0;
    if (failed !== 0) process.exit(failed);
    return 0;
  }
}
