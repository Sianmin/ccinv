export type Scope = "user" | "project" | "local" | "plugin";

export interface ResourceBase {
  name: string;
  description?: string;
  path: string;
  scope: Scope;
  pluginName?: string;
  marketplace?: string;
}

export interface CommandResource extends ResourceBase {
  kind: "command";
}

export interface SkillResource extends ResourceBase {
  kind: "skill";
  tools?: string;
}

export interface AgentResource extends ResourceBase {
  kind: "agent";
  tools?: string;
  model?: string;
  hasFrontmatter: boolean;
}

export interface HookResource {
  kind: "hook";
  event: string;
  matcher?: string;
  command?: string;
  type?: string;
  scope: Scope;
  path: string;
}

export interface McpResource {
  kind: "mcp";
  name: string;
  command?: string;
  url?: string;
  type?: string;
  scope: Scope;
  path: string;
}

export interface PluginResource {
  kind: "plugin";
  name: string;
  marketplace: string;
  path: string;
  commands: number;
  skills: number;
  agents: number;
  description?: string;
}

export interface Inventory {
  generatedAt: string;
  projectRoot: string | null;
  homeDir: string;
  commands: CommandResource[];
  skills: SkillResource[];
  agents: AgentResource[];
  hooks: HookResource[];
  mcp: McpResource[];
  plugins: PluginResource[];
  totals: {
    commands: number;
    skills: number;
    agents: number;
    hooks: number;
    mcp: number;
    plugins: number;
  };
}
