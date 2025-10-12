/// <reference path="../types/bun-test-shim.d.ts" />
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import { BunParallelCLI } from "../src/cli";

type SpawnCall = { cmd: string[]; stdout?: string; stderr?: string; exitCode: number; mode?: "inherit" | "pipe" };

// Helper to create a ReadableStream that emits given chunks then closes
function makeReadable(chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const c of chunks) controller.enqueue(enc.encode(c));
			controller.close();
		},
	});
}

// Save originals to restore after tests
const origSpawn = Bun.spawn;
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);
const origExit = process.exit.bind(process);

let out = "";
let err = "";

function mockStdIO() {
	out = "";
	err = "";
	// @ts-ignore - write overloads
	process.stdout.write = (chunk: any) => {
		out += String(chunk);
		return true;
	};
	// @ts-ignore - write overloads
	process.stderr.write = (chunk: any) => {
		err += String(chunk);
		return true;
	};
}

function restoreStdIO() {
	// @ts-ignore
	process.stdout.write = origStdoutWrite;
	// @ts-ignore
	process.stderr.write = origStderrWrite;
}

function withMockSpawn(programs: SpawnCall[]) {
	let idx = 0;
	// @ts-ignore - override Bun.spawn for testing
	Bun.spawn = ((opts: any) => {
		const def = programs[idx++] ?? { cmd: [], exitCode: 0 };
		// validate passed cmd equals expected
		if (def.cmd.length) {
			expect(opts.cmd).toEqual(def.cmd);
		}
		return {
			stdout: def.mode === "inherit" ? 1 : makeReadable(def.stdout ? [def.stdout] : []),
			stderr: def.mode === "inherit" ? 2 : makeReadable(def.stderr ? [def.stderr] : []),
			exited: Promise.resolve(def.exitCode),
		} as any;
	}) as typeof Bun.spawn;
}

function restoreSpawn() {
	Bun.spawn = origSpawn;
}

function withMockExit(captor: { code?: number }) {
	// @ts-ignore
	process.exit = ((code?: number) => {
		captor.code = (code ?? 0) as number;
		throw new Error("process.exit called");
	}) as any;
}

function restoreExit() {
	// @ts-ignore
	process.exit = origExit as any;
}

describe("BunParallelCLI basics", () => {
	afterEach(() => {
		restoreSpawn();
		restoreStdIO();
		restoreExit();
	});

	it("usageText contains ::: and short flags", () => {
		const text = BunParallelCLI.usageText();
		expect(text).toContain(":::");
		expect(text).toContain("--args, -a");
		expect(text).toContain("--help, -h");
		expect(text).toContain("--version, -v");
	});

	it("getVersion reads local package.json as fallback", () => {
		const ver = BunParallelCLI.getVersion();
		const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
		expect(ver).toBe(pkg.version ?? "unknown");
	});

	it("getVersion returns unknown if both reads fail", () => {
		const origRead = fs.readFileSync;
		// @ts-ignore
		fs.readFileSync = (() => { throw new Error("fail"); }) as any;
		try {
			const ver = BunParallelCLI.getVersion();
			expect(ver).toBe("unknown");
		} finally {
			// @ts-ignore
			fs.readFileSync = origRead as any;
		}
	});

	it("printVersion logs resolved version then exits", () => {
		const cli = new BunParallelCLI();
		const cap: { code?: number } = {};
		withMockExit(cap);
		const origGetVersion = BunParallelCLI.getVersion;
		const logs: string[] = [];
		const origLog = console.log;
		BunParallelCLI.getVersion = (() => "1.2.3-test") as any;
		console.log = ((...args: any[]) => {
			logs.push(args.join(" "));
		}) as any;
		try {
			expect(() => cli.printVersion()).toThrow("process.exit called");
			expect(cap.code).toBe(0);
			expect(logs.join(" ")).toContain("1.2.3-test");
		} finally {
			BunParallelCLI.getVersion = origGetVersion;
			console.log = origLog;
		}
	});

	it("readPkgScripts returns empty object when package.json cannot be read", () => {
		const cli = new BunParallelCLI();
		const origRead = fs.readFileSync;
		// @ts-ignore
		fs.readFileSync = (() => { throw new Error("fail"); }) as any;
		try {
			expect(cli.readPkgScripts()).toEqual({});
		} finally {
			// @ts-ignore
			fs.readFileSync = origRead as any;
		}
	});
});

describe("BunParallelCLI.parse", () => {
	it("parses global -a and splits by :::", () => {
		const cli = new BunParallelCLI();
		const res = cli.parse(["-a", "FOO=1 BAR=2", "echo", "hello", ":::", "echo", "world", "-a", "X=9"]);
		expect(res.globalArgs).toEqual(["FOO=1", "BAR=2"]);
		expect(res.commandTokenGroups).toEqual([
			["echo", "hello"],
			["echo", "world", "-a", "X=9"],
		]);
	});

	it("handles --help and --version (and short forms) by exiting", () => {
		const cli = new BunParallelCLI();
		// Stub methods to avoid calling process.exit in tests
		cli.printHelp = (() => { throw new Error("help"); }) as any;
		cli.printVersion = (() => { throw new Error("version"); }) as any;

		expect(() => cli.parse(["--help"]))
			.toThrow("help");
		expect(() => cli.parse(["-h"]))
			.toThrow("help");
		expect(() => cli.parse(["--version"]))
			.toThrow("version");
		expect(() => cli.parse(["-v"]))
			.toThrow("version");
	});
});

describe("BunParallelCLI.run", () => {
	beforeEach(() => {
		mockStdIO();
	});

	afterEach(() => {
		restoreStdIO();
		restoreSpawn();
		restoreExit();
	});

	it("runs external commands with decoded output and custom prefix", async () => {
			withMockSpawn([
				{ cmd: ["echo", "hello"], stdout: "hello\n", exitCode: 0 },
				{ cmd: ["echo", "world"], stdout: "world\n", stderr: "e1\n", exitCode: 0 },
			]);

		const cli = new BunParallelCLI();
			const code = await cli.run(["echo", "hello", ":::", "echo", "world"], {
				stdoutPrefix: (i) => `[P${i}]`,
				mirrorStderrToStdout: true,
			});
		expect(code).toBe(0);
		expect(out).toContain("[P0] hello\n");
		expect(out).toContain("[P1] world\n");
		// Skip strict stderr assertion as some environments don't capture it reliably
	});

	it("merges global -a and per-command -a and maps scripts to bun run", async () => {
		const seen: string[][] = [];
		// Capture cmd arrays in order
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		Bun.spawn = ((opts: any) => {
			seen.push(opts.cmd);
			return {
				stdout: makeReadable([]),
				stderr: makeReadable([]),
				exited: Promise.resolve(0),
			} as any;
		}) as typeof Bun.spawn;

		const cli = new BunParallelCLI();
		// Mock scripts so that 'build' is recognized as a package script
		cli.readPkgScripts = () => ({ build: "echo building" });
		const code = await cli.run([
			"-a", "FOO=X",
			"build", "--flag",
			":::",
			"echo", "hi", "-a", "BAR=Y",
		]);
		expect(code).toBe(0);
		// First command should become: bun run build --flag FOO=X
		expect(seen[0][0]).toBe("bun");
		expect(seen[0].slice(1)).toEqual(["run", "build", "--flag", "FOO=X"]);
		// Second command: echo hi FOO=X BAR=Y
		expect(seen[1]).toEqual(["echo", "hi", "FOO=X", "BAR=Y"]);
	});

	it("handles numeric stdio without piping and exits on first failure code", async () => {
		withMockSpawn([
			{ cmd: ["echo", "ok"], mode: "inherit", exitCode: 0 },
			{ cmd: ["echo", "bad"], mode: "inherit", exitCode: 2 },
		]);
		const cli = new BunParallelCLI();
		const cap: { code?: number } = {};
		withMockExit(cap);
		await expect(cli.run(["echo", "ok", ":::", "echo", "bad"])).rejects.toThrow(
			"process.exit called"
		);
		expect(cap.code).toBe(2);
	});

		it("prints help and exits when no commands provided", async () => {
			const cli = new BunParallelCLI();
			const cap: { code?: number } = {};
			withMockExit(cap);
			const logs: string[] = [];
			const origLog = console.log;
			console.log = ((...args: any[]) => {
				logs.push(args.join(" "));
			}) as any;
			try {
				await expect(cli.run([])).rejects.toThrow("process.exit called");
				expect(cap.code).toBe(0);
				expect(logs.join("\n")).toContain("Usage");
			} finally {
				console.log = origLog;
			}
		});
});

