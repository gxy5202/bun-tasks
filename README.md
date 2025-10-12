# bun-parallel

`bun-parallel` is a parallel task runner for the [Bun](https://bun.sh) runtime inspired by `concurrently`. Make sure Bun is installed and on your `PATH` (run `bun --version` to verify) before using this library. It understands the `:::` command separator, merges global and per-command environment variables, and automatically expands package scripts to `bun run <script>` when needed. The CLI is exposed as the binary `bun-parallel`; it is exported for programmatic usage but never auto-executes when imported.

## Installation

```bash
bun add -D bun-parallel
```

> **Prerequisite:** Bun must be available in your environment; install it from the official docs if `bun --version` fails.

## Quick start

Register a script in `package.json` that fans out to multiple commands:

```json
{
  "scripts": {
    "dev": "bun-parallel --args NODE_ENV=dev api ::: docs --args PORT=4000"
  }
}
```

Define the referenced scripts as usual:

```json
{
  "scripts": {
    "api": "bun run src/api.ts",
    "docs": "bun run docs:watch",
    "dev": "bun-parallel api ::: docs"
  }
}
```

## Command syntax

Commands are separated with `:::`. Each segment can take one of several forms:

- `scriptName` &rarr; expands to `bun run scriptName` using your local `package.json`.
- `bun run <task>` &rarr; forwarded as-is when you already include Bun.
- Any other executable (e.g. `node tools/build.js`) &rarr; executed directly by Bun.

### Environment variables

- `--args` / `-a` directly after `bun-parallel` defines **global** key/value pairs applied to every command.
- `--args` / `-a` after a command defines **per-command** variables.
- Global and local variables are merged; duplicates prefer the command-level value.

Example:

```bash
bun-parallel -a API_URL=https://api.dev api ::: queue --args QUEUE=media -a PORT=4010
```

### CLI flags

- `--help`, `-h` &mdash; display usage information.
- `--version`, `-v` &mdash; show the published version resolved from `package.json`.
- `--args`, `-a` &mdash; attach key/value pairs as described above.

## Programmatic usage

You can import the CLI class for custom orchestration:

```ts
import { BunParallelCLI } from "bun-parallel";

const cli = new BunParallelCLI();
await cli.run(["echo", "hello", ":::", "echo", "world"], {
  stdoutPrefix: (i) => `[job-${i}]`,
  mirrorStderrToStdout: true,
});
```

Because the package exports the class only, nothing runs automatically when the module is imported.

## Development

```bash
bun install
bun test --coverage
```

On Windows, Bun coverage reporting is experimental; if it fails you can temporarily drop the `--coverage` flag while the upstream feature matures.

## Acknowledgements

Portions of the codebase were authored with assistance from GPT-5-Codex.

## License

[MIT](./LICENSE)
