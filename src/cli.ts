#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { scan } from "./scan.js";
import { renderHtml } from "./render.js";
import { renderTable } from "./table.js";
import type { Scope } from "./types.js";

interface Args {
  html: boolean;
  json: boolean;
  stdout: boolean;
  noOpen: boolean;
  output?: string;
  cwd?: string;
  scopes?: Set<Scope>;
  includePlugins: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    html: false,
    json: false,
    stdout: false,
    noOpen: false,
    includePlugins: true,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "-V":
      case "--version":
        out.version = true;
        break;
      case "--html":
        out.html = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--stdout":
        out.stdout = true;
        break;
      case "--no-open":
        out.noOpen = true;
        break;
      case "--plugins":
      case "--all":
        out.includePlugins = true;
        break;
      case "--no-plugins":
        out.includePlugins = false;
        break;
      case "-o":
      case "--output":
        out.output = argv[++i];
        break;
      case "--cwd":
        out.cwd = argv[++i];
        break;
      case "--scope": {
        const v = argv[++i];
        if (!out.scopes) out.scopes = new Set<Scope>();
        for (const s of v.split(",")) {
          const trimmed = s.trim() as Scope;
          if (
            trimmed === "user" ||
            trimmed === "project" ||
            trimmed === "local" ||
            trimmed === "plugin"
          ) {
            out.scopes.add(trimmed);
          }
        }
        break;
      }
      default:
        if (a.startsWith("--scope=")) {
          const v = a.slice("--scope=".length);
          if (!out.scopes) out.scopes = new Set<Scope>();
          for (const s of v.split(",")) {
            const trimmed = s.trim() as Scope;
            if (
              trimmed === "user" ||
              trimmed === "project" ||
              trimmed === "local" ||
              trimmed === "plugin"
            ) {
              out.scopes.add(trimmed);
            }
          }
        }
        break;
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`ccinv — Claude Code resource inventory

Usage:
  ccinv [options]

Default: prints a colored table to stdout, including all scopes.

Output formats:
      --html             Render as HTML and open in browser
      --json             Print inventory JSON to stdout

Filtering:
      --no-plugins       Hide plugin-scope resources in table output
      --scope <list>     Comma-separated: user,project,local,plugin
                         (applied to JSON / HTML)

HTML options:
  -o, --output <path>    Write HTML to a specific file path (with --html)
      --no-open          Do not auto-open the HTML in browser
      --stdout           Print HTML to stdout (with --html)

Misc:
      --cwd <path>       Use a different working directory for project detection
  -V, --version          Print version
  -h, --help             Print this help

Examples:
  ccinv                       # quick terminal table (all scopes)
  ccinv --no-plugins          # hide plugin resources
  ccinv --html                # open HTML dashboard in browser
  ccinv --json | jq '.totals' # machine-readable output
`);
}

async function openInBrowser(path: string): Promise<void> {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", path] : [path];
  await new Promise<void>((resolve) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => resolve());
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.version) {
    const pkg = await import("../package.json", { with: { type: "json" } });
    process.stdout.write(`${(pkg as any).default.version}\n`);
    return;
  }

  const inventory = await scan({ cwd: args.cwd, scopes: args.scopes });

  if (args.json) {
    process.stdout.write(JSON.stringify(inventory, null, 2) + "\n");
    return;
  }

  if (!args.html) {
    process.stdout.write(
      renderTable(inventory, { includePlugins: args.includePlugins }) + "\n",
    );
    return;
  }

  const html = renderHtml(inventory);

  if (args.stdout) {
    process.stdout.write(html);
    return;
  }

  let outPath = args.output;
  if (!outPath) {
    const dir = join(tmpdir(), "ccinv");
    await mkdir(dir, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace(/T/, "-")
      .slice(0, -5);
    outPath = join(dir, `ccinv-${stamp}.html`);
  }

  await writeFile(outPath, html, "utf8");

  const t = inventory.totals;
  process.stdout.write(
    `ccinv → ${outPath}\n` +
      `commands ${t.commands} · skills ${t.skills} · agents ${t.agents} · ` +
      `hooks ${t.hooks} · mcp ${t.mcp} · plugins ${t.plugins}\n`,
  );

  if (!args.noOpen) {
    await openInBrowser(outPath);
  }
}

main().catch((err) => {
  process.stderr.write(`ccinv error: ${err?.message ?? err}\n`);
  process.exit(1);
});
