import type { Inventory, Scope } from "./types.js";

const NO_COLOR = process.env.NO_COLOR != null || !process.stdout.isTTY;

const c = {
  reset: NO_COLOR ? "" : "\x1b[0m",
  bold: NO_COLOR ? "" : "\x1b[1m",
  dim: NO_COLOR ? "" : "\x1b[2m",
  red: NO_COLOR ? "" : "\x1b[31m",
  green: NO_COLOR ? "" : "\x1b[32m",
  yellow: NO_COLOR ? "" : "\x1b[33m",
  blue: NO_COLOR ? "" : "\x1b[34m",
  magenta: NO_COLOR ? "" : "\x1b[35m",
  cyan: NO_COLOR ? "" : "\x1b[36m",
  gray: NO_COLOR ? "" : "\x1b[90m",
};

const SCOPE_ORDER: Record<Scope, number> = {
  project: 0,
  local: 1,
  user: 2,
  plugin: 3,
};

const SCOPE_COLOR: Record<Scope, string> = {
  user: c.blue,
  project: c.green,
  local: c.yellow,
  plugin: c.gray,
};

function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function pad(s: string, width: number): string {
  const len = visibleLength(s);
  if (len >= width) return s;
  return s + " ".repeat(width - len);
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function tildify(p: string, home: string): string {
  if (p.startsWith(home)) return "~" + p.slice(home.length);
  return p;
}

function scopeTag(scope: Scope, plugin?: string): string {
  const color = SCOPE_COLOR[scope];
  const label = scope === "plugin" && plugin ? `plugin:${plugin}` : scope;
  return `${color}${label}${c.reset}`;
}

function compareByScope<
  T extends { scope: Scope; name: string; pluginName?: string; marketplace?: string },
>(a: T, b: T): number {
  const so = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
  if (so !== 0) return so;
  if (a.scope === "plugin") {
    const mk = (a.marketplace ?? "").localeCompare(b.marketplace ?? "");
    if (mk !== 0) return mk;
    const pn = (a.pluginName ?? "").localeCompare(b.pluginName ?? "");
    if (pn !== 0) return pn;
  }
  return a.name.localeCompare(b.name);
}

interface RenderOptions {
  includePlugins: boolean;
}

export function renderTable(inv: Inventory, opts: RenderOptions): string {
  const home = inv.homeDir;
  const lines: string[] = [];

  lines.push(`${c.bold}ccinv${c.reset} ${c.dim}— Claude Code inventory${c.reset}`);
  if (inv.projectRoot) {
    lines.push(`${c.dim}project:${c.reset} ${tildify(inv.projectRoot, home)}`);
  } else {
    lines.push(`${c.dim}project:${c.reset} ${c.yellow}(none — running outside a .claude/ root)${c.reset}`);
  }
  lines.push(`${c.dim}generated:${c.reset} ${new Date(inv.generatedAt).toLocaleString()}`);
  lines.push("");

  const t = inv.totals;
  lines.push(`${c.bold}OVERVIEW${c.reset}`);
  const summary = [
    `commands ${c.bold}${t.commands}${c.reset}`,
    `skills ${c.bold}${t.skills}${c.reset}`,
    `agents ${c.bold}${t.agents}${c.reset}`,
    `hooks ${c.bold}${t.hooks}${c.reset}`,
    `mcp ${c.bold}${t.mcp}${c.reset}`,
    `plugins ${c.bold}${t.plugins}${c.reset}`,
  ];
  lines.push("  " + summary.join(c.dim + " · " + c.reset));
  lines.push("");

  const filterScope = <T extends { scope: Scope }>(items: T[]) =>
    opts.includePlugins ? items : items.filter((x) => x.scope !== "plugin");

  const cmds = filterScope(inv.commands).sort(compareByScope);
  const skills = filterScope(inv.skills).sort(compareByScope);
  const agents = filterScope(inv.agents).sort(compareByScope);
  const hooks = filterScope(inv.hooks).sort((a, b) => {
    const so = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    if (so !== 0) return so;
    return a.event.localeCompare(b.event);
  });
  const mcp = filterScope(inv.mcp).sort(compareByScope);

  if (cmds.length) {
    lines.push(`${c.bold}COMMANDS${c.reset} ${c.dim}(${cmds.length})${c.reset}`);
    const nameW = Math.min(28, Math.max(...cmds.map((c) => c.name.length + 1)));
    for (const cmd of cmds) {
      const n = pad(`/${cmd.name}`, nameW);
      const desc = truncate(cmd.description ?? "", 60);
      lines.push(`  ${c.cyan}${n}${c.reset}  ${c.dim}${desc}${c.reset}  ${scopeTag(cmd.scope, cmd.pluginName)}`);
    }
    lines.push("");
  }

  if (skills.length) {
    lines.push(`${c.bold}SKILLS${c.reset} ${c.dim}(${skills.length})${c.reset}`);
    const nameW = Math.min(28, Math.max(...skills.map((s) => s.name.length)));
    for (const s of skills) {
      const n = pad(s.name, nameW);
      const desc = truncate(s.description ?? "", 60);
      lines.push(`  ${c.cyan}${n}${c.reset}  ${c.dim}${desc}${c.reset}  ${scopeTag(s.scope, s.pluginName)}`);
    }
    lines.push("");
  }

  if (agents.length) {
    lines.push(`${c.bold}AGENTS${c.reset} ${c.dim}(${agents.length})${c.reset}`);
    const nameW = Math.min(28, Math.max(...agents.map((a) => a.name.length)));
    for (const a of agents) {
      const n = pad(a.name, nameW);
      const desc = truncate(a.description ?? "", 60);
      const warn = a.hasFrontmatter ? "" : ` ${c.yellow}[no fm]${c.reset}`;
      lines.push(`  ${c.cyan}${n}${c.reset}  ${c.dim}${desc}${c.reset}${warn}  ${scopeTag(a.scope, a.pluginName)}`);
    }
    lines.push("");
  }

  if (hooks.length) {
    lines.push(`${c.bold}HOOKS${c.reset} ${c.dim}(${hooks.length})${c.reset}`);
    const evW = Math.max(...hooks.map((h) => h.event.length));
    for (const h of hooks) {
      const ev = pad(h.event, evW);
      const cmd = truncate(h.command ?? "(no command)", 70);
      lines.push(`  ${c.magenta}${ev}${c.reset}  ${c.dim}${cmd}${c.reset}  ${scopeTag(h.scope)}`);
    }
    lines.push("");
  }

  if (mcp.length) {
    lines.push(`${c.bold}MCP${c.reset} ${c.dim}(${mcp.length})${c.reset}`);
    const nameW = Math.max(...mcp.map((m) => m.name.length));
    for (const m of mcp) {
      const n = pad(m.name, nameW);
      const target = truncate(m.command ?? m.url ?? "", 60);
      lines.push(`  ${c.cyan}${n}${c.reset}  ${c.dim}${target}${c.reset}  ${scopeTag(m.scope)}`);
    }
    lines.push("");
  }

  if (opts.includePlugins && inv.plugins.length) {
    lines.push(`${c.bold}PLUGINS${c.reset} ${c.dim}(${inv.plugins.length})${c.reset}`);
    const grouped = new Map<string, typeof inv.plugins>();
    for (const p of inv.plugins) {
      if (!grouped.has(p.marketplace)) grouped.set(p.marketplace, []);
      grouped.get(p.marketplace)!.push(p);
    }
    for (const [mk, plugins] of [...grouped.entries()].sort()) {
      lines.push(`  ${c.dim}${mk}${c.reset}`);
      const nameW = Math.max(...plugins.map((p) => p.name.length));
      for (const p of plugins.sort((a, b) => a.name.localeCompare(b.name))) {
        const n = pad(p.name, nameW);
        const counts = `cmd:${p.commands} skill:${p.skills} agent:${p.agents}`;
        lines.push(`    ${c.cyan}${n}${c.reset}  ${c.dim}${counts}${c.reset}`);
      }
    }
    lines.push("");
  } else if (!opts.includePlugins && inv.plugins.length) {
    lines.push(
      `${c.dim}${inv.plugins.length} plugin(s) hidden${c.reset}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}
