import { readdir, stat, readFile, access } from "node:fs/promises";
import { join, dirname, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { readAndParse } from "./parse.js";
import type {
  Inventory,
  CommandResource,
  SkillResource,
  AgentResource,
  HookResource,
  McpResource,
  PluginResource,
  Scope,
} from "./types.js";

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function findProjectRoot(start: string): Promise<string | null> {
  let cur = resolve(start);
  while (true) {
    if (await isDir(join(cur, ".claude"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

async function scanCommandsDir(
  dir: string,
  scope: Scope,
): Promise<CommandResource[]> {
  if (!(await isDir(dir))) return [];
  const out: CommandResource[] = [];
  const entries = await listDirSafe(dir);
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const path = join(dir, e);
    const name = basename(e, ".md");
    let description: string | undefined;
    try {
      const parsed = await readAndParse(path);
      const desc = parsed.frontmatter.description;
      if (typeof desc === "string") description = desc;
      if (!description) {
        const firstHeading = parsed.body
          .split(/\r?\n/)
          .find((l) => l.startsWith("#"));
        if (firstHeading) {
          description = firstHeading.replace(/^#+\s*/, "").trim();
        }
      }
    } catch {}
    out.push({ kind: "command", name, description, path, scope });
  }
  return out;
}

async function scanSkillsDir(
  dir: string,
  scope: Scope,
  pluginName?: string,
  marketplace?: string,
): Promise<SkillResource[]> {
  if (!(await isDir(dir))) return [];
  const out: SkillResource[] = [];
  const entries = await listDirSafe(dir);
  for (const e of entries) {
    const skillDir = join(dir, e);
    if (!(await isDir(skillDir))) continue;
    const skillMd = join(skillDir, "SKILL.md");
    if (!(await isFile(skillMd))) continue;
    let name = e;
    let description: string | undefined;
    let tools: string | undefined;
    try {
      const parsed = await readAndParse(skillMd);
      const fmName = parsed.frontmatter.name;
      const fmDesc = parsed.frontmatter.description;
      const fmTools = parsed.frontmatter["allowed-tools"] ?? parsed.frontmatter.tools;
      if (typeof fmName === "string") name = fmName;
      if (typeof fmDesc === "string") description = fmDesc;
      if (typeof fmTools === "string") tools = fmTools;
      else if (Array.isArray(fmTools)) tools = fmTools.join(", ");
    } catch {}
    out.push({
      kind: "skill",
      name,
      description,
      path: skillMd,
      scope,
      tools,
      pluginName,
      marketplace,
    });
  }
  return out;
}

async function scanAgentsDir(
  dir: string,
  scope: Scope,
  pluginName?: string,
  marketplace?: string,
): Promise<AgentResource[]> {
  if (!(await isDir(dir))) return [];
  const out: AgentResource[] = [];
  const entries = await listDirSafe(dir);
  for (const e of entries) {
    if (!e.endsWith(".md")) continue;
    const path = join(dir, e);
    let name = basename(e, ".md");
    let description: string | undefined;
    let tools: string | undefined;
    let model: string | undefined;
    let hasFrontmatter = false;
    try {
      const parsed = await readAndParse(path);
      hasFrontmatter = parsed.hasFrontmatter;
      const fmName = parsed.frontmatter.name;
      const fmDesc = parsed.frontmatter.description;
      const fmTools = parsed.frontmatter.tools;
      const fmModel = parsed.frontmatter.model;
      if (typeof fmName === "string") name = fmName;
      if (typeof fmDesc === "string") description = fmDesc;
      if (typeof fmTools === "string") tools = fmTools;
      else if (Array.isArray(fmTools)) tools = fmTools.join(", ");
      if (typeof fmModel === "string") model = fmModel;
    } catch {}
    out.push({
      kind: "agent",
      name,
      description,
      path,
      scope,
      tools,
      model,
      hasFrontmatter,
      pluginName,
      marketplace,
    });
  }
  return out;
}

async function readJsonSafe(path: string): Promise<any | null> {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractHooks(json: any, path: string, scope: Scope): HookResource[] {
  if (!json || typeof json !== "object" || !json.hooks) return [];
  const out: HookResource[] = [];
  const hooks = json.hooks;
  for (const event of Object.keys(hooks)) {
    const entries = hooks[event];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const matcher = typeof entry?.matcher === "string" ? entry.matcher : undefined;
      const inner = Array.isArray(entry?.hooks) ? entry.hooks : [entry];
      for (const h of inner) {
        out.push({
          kind: "hook",
          event,
          matcher,
          command: typeof h?.command === "string" ? h.command : undefined,
          type: typeof h?.type === "string" ? h.type : undefined,
          scope,
          path,
        });
      }
    }
  }
  return out;
}

function extractMcp(json: any, path: string, scope: Scope): McpResource[] {
  if (!json || typeof json !== "object") return [];
  const servers = json.mcpServers ?? json.mcp_servers;
  if (!servers || typeof servers !== "object") return [];
  const out: McpResource[] = [];
  for (const name of Object.keys(servers)) {
    const cfg = servers[name];
    out.push({
      kind: "mcp",
      name,
      command: typeof cfg?.command === "string" ? cfg.command : undefined,
      url: typeof cfg?.url === "string" ? cfg.url : undefined,
      type: typeof cfg?.type === "string" ? cfg.type : undefined,
      scope,
      path,
    });
  }
  return out;
}

async function scanPlugins(home: string): Promise<{
  plugins: PluginResource[];
  pluginCommands: CommandResource[];
  pluginSkills: SkillResource[];
  pluginAgents: AgentResource[];
}> {
  const marketplacesRoot = join(home, ".claude", "plugins", "marketplaces");
  const plugins: PluginResource[] = [];
  const pluginCommands: CommandResource[] = [];
  const pluginSkills: SkillResource[] = [];
  const pluginAgents: AgentResource[] = [];

  if (!(await isDir(marketplacesRoot))) {
    return { plugins, pluginCommands, pluginSkills, pluginAgents };
  }

  const marketplaces = await listDirSafe(marketplacesRoot);
  for (const mk of marketplaces) {
    const pluginsDir = join(marketplacesRoot, mk, "plugins");
    if (!(await isDir(pluginsDir))) continue;
    const pluginNames = await listDirSafe(pluginsDir);
    for (const pn of pluginNames) {
      const pluginPath = join(pluginsDir, pn);
      if (!(await isDir(pluginPath))) continue;

      let description: string | undefined;
      const manifestPath = join(pluginPath, ".claude-plugin", "plugin.json");
      const manifest = await readJsonSafe(manifestPath);
      if (manifest && typeof manifest.description === "string") {
        description = manifest.description;
      }

      const cmds = await scanCommandsDir(join(pluginPath, "commands"), "plugin");
      const skills = await scanSkillsDir(
        join(pluginPath, "skills"),
        "plugin",
        pn,
        mk,
      );
      const agents = await scanAgentsDir(
        join(pluginPath, "agents"),
        "plugin",
        pn,
        mk,
      );

      for (const c of cmds) {
        pluginCommands.push({ ...c, pluginName: pn, marketplace: mk });
      }
      pluginSkills.push(...skills);
      pluginAgents.push(...agents);

      plugins.push({
        kind: "plugin",
        name: pn,
        marketplace: mk,
        path: pluginPath,
        commands: cmds.length,
        skills: skills.length,
        agents: agents.length,
        description,
      });
    }
  }

  return { plugins, pluginCommands, pluginSkills, pluginAgents };
}

export interface ScanOptions {
  cwd?: string;
  scopes?: Set<Scope>;
}

export async function scan(opts: ScanOptions = {}): Promise<Inventory> {
  const cwd = opts.cwd ?? process.cwd();
  const home = homedir();
  const projectRoot = await findProjectRoot(cwd);
  const wantsScope = (s: Scope) =>
    !opts.scopes || opts.scopes.size === 0 || opts.scopes.has(s);

  const commands: CommandResource[] = [];
  const skills: SkillResource[] = [];
  const agents: AgentResource[] = [];
  const hooks: HookResource[] = [];
  const mcp: McpResource[] = [];

  const userClaudeJson = await readJsonSafe(join(home, ".claude.json"));

  if (wantsScope("user")) {
    commands.push(
      ...(await scanCommandsDir(join(home, ".claude", "commands"), "user")),
    );
    skills.push(
      ...(await scanSkillsDir(join(home, ".claude", "skills"), "user")),
    );
    agents.push(
      ...(await scanAgentsDir(join(home, ".claude", "agents"), "user")),
    );
    const userSettings = await readJsonSafe(
      join(home, ".claude", "settings.json"),
    );
    if (userSettings) {
      hooks.push(
        ...extractHooks(userSettings, join(home, ".claude", "settings.json"), "user"),
      );
      mcp.push(
        ...extractMcp(userSettings, join(home, ".claude", "settings.json"), "user"),
      );
    }
    if (userClaudeJson) {
      mcp.push(...extractMcp(userClaudeJson, join(home, ".claude.json"), "user"));
    }
  }

  if (projectRoot && wantsScope("project")) {
    const proj = join(projectRoot, ".claude");
    commands.push(...(await scanCommandsDir(join(proj, "commands"), "project")));
    skills.push(...(await scanSkillsDir(join(proj, "skills"), "project")));
    agents.push(...(await scanAgentsDir(join(proj, "agents"), "project")));
    const projSettings = await readJsonSafe(join(proj, "settings.json"));
    if (projSettings) {
      hooks.push(
        ...extractHooks(projSettings, join(proj, "settings.json"), "project"),
      );
      mcp.push(
        ...extractMcp(projSettings, join(proj, "settings.json"), "project"),
      );
    }
    const projMcpJson = await readJsonSafe(join(projectRoot, ".mcp.json"));
    if (projMcpJson) {
      mcp.push(
        ...extractMcp(projMcpJson, join(projectRoot, ".mcp.json"), "project"),
      );
    }
    if (
      userClaudeJson &&
      userClaudeJson.projects &&
      typeof userClaudeJson.projects === "object"
    ) {
      const projEntry = (userClaudeJson.projects as Record<string, unknown>)[
        projectRoot
      ];
      if (projEntry && typeof projEntry === "object") {
        mcp.push(
          ...extractMcp(projEntry, join(home, ".claude.json"), "project"),
        );
      }
    }
  }

  if (projectRoot && wantsScope("local")) {
    const local = join(projectRoot, ".claude", "settings.local.json");
    const localSettings = await readJsonSafe(local);
    if (localSettings) {
      hooks.push(...extractHooks(localSettings, local, "local"));
      mcp.push(...extractMcp(localSettings, local, "local"));
    }
  }

  let plugins: PluginResource[] = [];
  if (wantsScope("plugin")) {
    const pluginScan = await scanPlugins(home);
    plugins = pluginScan.plugins;
    commands.push(...pluginScan.pluginCommands);
    skills.push(...pluginScan.pluginSkills);
    agents.push(...pluginScan.pluginAgents);
  }

  return {
    generatedAt: new Date().toISOString(),
    projectRoot,
    homeDir: home,
    commands,
    skills,
    agents,
    hooks,
    mcp,
    plugins,
    totals: {
      commands: commands.length,
      skills: skills.length,
      agents: agents.length,
      hooks: hooks.length,
      mcp: mcp.length,
      plugins: plugins.length,
    },
  };
}
