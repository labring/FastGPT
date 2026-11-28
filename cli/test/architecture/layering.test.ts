import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(__dirname, '../../src');

const LAYER_RANK: Record<string, number> = {
  shared: 0,
  infra: 1,
  domain: 2,
  cli: 3
};

function collectTsFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

function parseRelativeImportTargets(relFile: string): string[] {
  const content = readFileSync(join(SRC_ROOT, relFile), 'utf8');
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["'](\.[^"']+)["']/g;
  const targets: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const rawTarget = match[1];
    let normalized = normalize(join(dirname(relFile), rawTarget));
    if (!normalized.endsWith('.ts') && !normalized.endsWith('.json')) {
      if (existsSync(join(SRC_ROOT, `${normalized}.ts`))) {
        normalized = `${normalized}.ts`;
      } else if (existsSync(join(SRC_ROOT, normalized, 'index.ts'))) {
        normalized = join(normalized, 'index.ts');
      }
    }
    if (normalized.endsWith('.ts') && !normalized.startsWith('..')) {
      targets.push(normalized);
    }
  }
  return targets;
}

function getLayer(relFile: string): string | undefined {
  const top = relFile.split('/')[0];
  return top in LAYER_RANK ? top : undefined;
}

function getDomainBucket(relFile: string): string | undefined {
  const parts = relFile.split('/');
  return parts[0] === 'domain' && parts.length >= 2 ? parts[1] : undefined;
}

function getCommandBucket(relFile: string): string | undefined {
  const parts = relFile.split('/');
  if (parts[0] === 'cli' && parts[1] === 'commands' && parts.length >= 3) {
    return parts[2].replace(/\.ts$/, '');
  }
  return undefined;
}

describe('CLI Architecture Layering & DAG Guard', () => {
  const files = collectTsFiles(SRC_ROOT).map((f) => relative(SRC_ROOT, f));
  const edges = files.flatMap((from) =>
    parseRelativeImportTargets(from).map((to) => ({ from, to }))
  );

  it('enforces strict bottom-up layering (shared -> infra -> domain -> cli)', () => {
    const violations: string[] = [];
    for (const { from, to } of edges) {
      const fromLayer = getLayer(from);
      const toLayer = getLayer(to);
      if (fromLayer && toLayer && LAYER_RANK[toLayer] > LAYER_RANK[fromLayer]) {
        violations.push(`${from} -> ${to}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('forbids cross-domain and inverted domain/shared imports in domain/', () => {
    const violations: string[] = [];
    for (const { from, to } of edges) {
      const fromDomain = getDomainBucket(from);
      const toDomain = getDomainBucket(to);
      if (fromDomain && toDomain && fromDomain !== toDomain && toDomain !== 'shared') {
        violations.push(`${from} -> ${to}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('forbids cross-domain sibling imports in cli/commands/', () => {
    const violations: string[] = [];
    for (const { from, to } of edges) {
      const fromCmd = getCommandBucket(from);
      const toCmd = getCommandBucket(to);
      if (fromCmd && toCmd && fromCmd !== toCmd && toCmd !== 'shared') {
        violations.push(`${from} -> ${to}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('forbids cli/commands/shared/ from depending on concrete domain subdomains', () => {
    const violations: string[] = [];
    for (const { from, to } of edges) {
      if (from.startsWith('cli/commands/shared/')) {
        const toDomain = getDomainBucket(to);
        if (toDomain && toDomain !== 'shared') {
          violations.push(`${from} -> ${to}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('has zero circular module import cycles across cli/src/', () => {
    const adjacency = new Map<string, string[]>();
    for (const { from, to } of edges) {
      const list = adjacency.get(from) ?? [];
      list.push(to);
      adjacency.set(from, list);
    }

    const visited = new Set<string>();
    const activeStack = new Set<string>();
    const cycles: string[] = [];

    const visit = (node: string, trail: string[]) => {
      visited.add(node);
      activeStack.add(node);
      for (const next of adjacency.get(node) ?? []) {
        if (activeStack.has(next)) {
          cycles.push([...trail.slice(trail.indexOf(next)), next].join(' -> '));
        } else if (!visited.has(next)) {
          visit(next, [...trail, next]);
        }
      }
      activeStack.delete(node);
    };

    for (const file of files) {
      if (!visited.has(file)) {
        visit(file, [file]);
      }
    }

    expect(cycles).toEqual([]);
  });

  it('forbids module re-exports across cli/src/', () => {
    const violations: string[] = [];
    const reExportFromRegex = /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["'][^"']+["']/gm;
    const importIdentRegex = /^\s*import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'][^"']+["']/gm;
    const localExportRegex = /^\s*export\s+(?:type\s+)?\{([^}]*)\}\s*;?\s*$/gm;

    for (const file of files) {
      const content = readFileSync(join(SRC_ROOT, file), 'utf8');
      if (reExportFromRegex.test(content)) {
        violations.push(`${file}: export ... from`);
      }
      reExportFromRegex.lastIndex = 0;

      const importedNames = new Set<string>();
      let importMatch: RegExpExecArray | null;
      while ((importMatch = importIdentRegex.exec(content)) !== null) {
        for (const rawSpec of importMatch[1].split(',')) {
          const cleaned = rawSpec
            .replace(/^type\s+/, '')
            .trim()
            .split(/\s+as\s+/);
          const localName = (cleaned[1] ?? cleaned[0])?.trim();
          if (localName) importedNames.add(localName);
        }
      }
      importIdentRegex.lastIndex = 0;

      let exportMatch: RegExpExecArray | null;
      while ((exportMatch = localExportRegex.exec(content)) !== null) {
        for (const rawSpec of exportMatch[1].split(',')) {
          const localName = rawSpec
            .replace(/^type\s+/, '')
            .trim()
            .split(/\s+as\s+/)[0]
            ?.trim();
          if (localName && importedNames.has(localName)) {
            violations.push(`${file}: re-exported imported symbol "${localName}"`);
          }
        }
      }
      localExportRegex.lastIndex = 0;
    }

    expect(violations).toEqual([]);
  });
});
