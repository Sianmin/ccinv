import { readFile } from "node:fs/promises";

export interface Frontmatter {
  [key: string]: string | string[] | undefined;
}

export interface ParsedFile {
  frontmatter: Frontmatter;
  body: string;
  hasFrontmatter: boolean;
}

const FM_DELIM = /^---\s*$/;

export function parseFrontmatter(content: string): ParsedFile {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || !FM_DELIM.test(lines[0])) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FM_DELIM.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }
  const fmLines = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join("\n");
  const frontmatter = parseSimpleYaml(fmLines);
  return { frontmatter, body, hasFrontmatter: true };
}

function parseSimpleYaml(lines: string[]): Frontmatter {
  const out: Frontmatter = {};
  let currentKey: string | null = null;
  let listAccum: string[] | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentKey && listAccum) {
      listAccum.push(stripQuotes(listMatch[1].trim()));
      continue;
    }

    if (currentKey && listAccum) {
      out[currentKey] = listAccum;
      currentKey = null;
      listAccum = null;
    }

    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const valRaw = kv[2].trim();
    if (valRaw === "" || valRaw === "|" || valRaw === ">") {
      currentKey = key;
      listAccum = [];
      continue;
    }
    if (valRaw.startsWith("[") && valRaw.endsWith("]")) {
      const inner = valRaw.slice(1, -1);
      out[key] = inner
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
      continue;
    }
    out[key] = stripQuotes(valRaw);
  }

  if (currentKey && listAccum) {
    out[currentKey] = listAccum;
  }

  return out;
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

export async function readAndParse(path: string): Promise<ParsedFile> {
  const content = await readFile(path, "utf8");
  return parseFrontmatter(content);
}
