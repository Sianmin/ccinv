# ccinv

Inventory dashboard for [Claude Code](https://docs.claude.com/en/docs/claude-code) resources — commands, skills, agents, hooks, MCP servers, and plugins — across **user**, **project**, and **local** scopes.

Zero LLM calls. Zero servers. Just `npx ccinv` and a single-file HTML dashboard opens in your browser.

## Why

Claude Code spreads configuration across `~/.claude/`, `<project>/.claude/`, plugin marketplaces, and per-user `settings.local.json`. Existing dashboards (SkillDeck, ClaudHub) only scan the user scope. ccinv scans **all three scopes plus plugins** and renders the result instantly.

It's deterministic file-system work — there's no reason to burn LLM tokens for it.

## Install / Run

```bash
npx ccinv
```

That's it. A timestamped HTML file is written to your temp dir and opened in your default browser.

## Usage

```
ccinv [options]

  -o, --output <path>   Write HTML to a specific file path
      --no-open         Do not auto-open the HTML in browser
      --stdout          Print HTML to stdout (implies --no-open)
      --json            Print inventory JSON to stdout (implies --no-open)
      --cwd <path>      Use a different working directory for project detection
      --scope <list>    Comma-separated scopes: user,project,local,plugin
                        (default: all)
  -V, --version         Print version
  -h, --help            Print help
```

## What it scans

| Resource | User | Project | Local | Plugin |
|----------|------|---------|-------|--------|
| Commands | `~/.claude/commands/*.md` | `<root>/.claude/commands/*.md` | — | `~/.claude/plugins/marketplaces/*/plugins/*/commands/*.md` |
| Skills | `~/.claude/skills/*/SKILL.md` | `<root>/.claude/skills/*/SKILL.md` | — | `~/.claude/plugins/marketplaces/*/plugins/*/skills/*/SKILL.md` |
| Agents | `~/.claude/agents/*.md` | `<root>/.claude/agents/*.md` | — | `~/.claude/plugins/marketplaces/*/plugins/*/agents/*.md` |
| Hooks | `~/.claude/settings.json` | `<root>/.claude/settings.json` | `<root>/.claude/settings.local.json` | — |
| MCP | `~/.claude.json`, `~/.claude/settings.json` | `<root>/.claude/settings.json` | `<root>/.claude/settings.local.json` | — |

`<root>` is detected by walking up from the current directory until a `.claude/` is found.

## Example: scripting

```bash
# count plugin-provided agents
npx ccinv --json | jq '[.agents[] | select(.scope == "plugin")] | length'
```

## Status

`v0.1.0` — initial release.

- Tested on macOS.
- Linux and Windows are untested. The code only uses Node's cross-platform APIs (`os`, `path`, `fs/promises`) and branches on `process.platform` for browser open (`open` / `xdg-open` / `cmd start`), so it should work — but no guarantees yet.
- ANSI color is auto-disabled when stdout is not a TTY or `NO_COLOR` is set.

Bug reports welcome on [GitHub Issues](https://github.com/Sianmin/ccinv/issues).

## License

MIT © Sianmin
