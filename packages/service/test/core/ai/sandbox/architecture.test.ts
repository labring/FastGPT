import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const sandboxRoot = resolve(testDirectory, '../../../../core/ai/sandbox');
const serviceRoot = resolve(sandboxRoot, '../../..');
const ignoredDirectories = new Set(['node_modules', 'coverage', '.next', '.turbo']);

const listTypeScriptFiles = (root: string): string[] =>
  readdirSync(root).flatMap((name): string[] => {
    if (ignoredDirectories.has(name)) return [];
    const path = resolve(root, name);
    const entry = lstatSync(path);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });

const getModuleSpecifiers = (path: string): string[] => {
  return ts
    .preProcessFile(readFileSync(path, 'utf8'), true, true)
    .importedFiles.map(({ fileName }) => fileName);
};

const resolveRelativeModule = (from: string, specifier: string): string | undefined => {
  if (!specifier.startsWith('.')) return undefined;
  const target = resolve(dirname(from), specifier);
  const candidates = [`${target}.ts`, `${target}.tsx`, resolve(target, 'index.ts')];
  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
};

const displayPath = (path: string) => relative(serviceRoot, path).split(sep).join('/');

type SandboxLayer = 'interface' | 'application' | 'legacy' | 'infrastructure' | 'shared';

const getSandboxLayer = (filePath: string): SandboxLayer => {
  const rel = relative(sandboxRoot, filePath).split(sep).join('/');
  const top = rel.split('/')[0];
  if (
    top === 'interface' ||
    top === 'application' ||
    top === 'legacy' ||
    top === 'infrastructure'
  ) {
    return top;
  }
  return 'shared';
};

const allowedLayerDependencies: Record<SandboxLayer, ReadonlySet<SandboxLayer>> = {
  interface: new Set(['interface', 'application', 'infrastructure', 'shared']),
  application: new Set(['application', 'legacy', 'infrastructure', 'shared']),
  legacy: new Set(['legacy', 'infrastructure', 'shared']),
  infrastructure: new Set(['infrastructure', 'shared']),
  shared: new Set(['shared'])
};

describe('sandbox architecture boundaries', () => {
  it('has no relative-import cycles inside the sandbox domain', () => {
    const files = listTypeScriptFiles(sandboxRoot);
    const fileSet = new Set(files);
    const graph = new Map(
      files.map((file) => [
        file,
        getModuleSpecifiers(file)
          .map((specifier) => resolveRelativeModule(file, specifier))
          .filter((target): target is string => Boolean(target && fileSet.has(target)))
      ])
    );
    const visited = new Set<string>();
    const active = new Set<string>();
    const stack: string[] = [];
    const cycles: string[] = [];

    const visit = (file: string) => {
      if (active.has(file)) {
        const cycleStart = stack.indexOf(file);
        cycles.push([...stack.slice(cycleStart), file].map(displayPath).join(' -> '));
        return;
      }
      if (visited.has(file)) return;
      visited.add(file);
      active.add(file);
      stack.push(file);
      for (const dependency of graph.get(file) ?? []) visit(dependency);
      stack.pop();
      active.delete(file);
    };
    for (const file of files) visit(file);

    expect(cycles).toEqual([]);
  });

  it('enforces unidirectional layer dependencies inside the sandbox domain', () => {
    const files = listTypeScriptFiles(sandboxRoot);
    const fileSet = new Set(files);
    const violations: string[] = [];

    for (const file of files) {
      const fromLayer = getSandboxLayer(file);
      const allowed = allowedLayerDependencies[fromLayer];
      for (const specifier of getModuleSpecifiers(file)) {
        const target = resolveRelativeModule(file, specifier);
        if (!target || !fileSet.has(target)) continue;
        const toLayer = getSandboxLayer(target);
        if (!allowed.has(toLayer)) {
          violations.push(
            `${displayPath(file)} [${fromLayer}] -> ${displayPath(target)} [${toLayer}]`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
