import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const sandboxRoot = resolve(testDirectory, '../../../../core/ai/sandbox');
const serviceRoot = resolve(sandboxRoot, '../../..');
const appSourceRoot = resolve(serviceRoot, '../../projects/app/src');
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
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
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

  it('does not let application or infrastructure depend on interface', () => {
    const forbidden: string[] = [];
    for (const layer of ['application', 'infrastructure']) {
      for (const file of listTypeScriptFiles(resolve(sandboxRoot, layer))) {
        for (const specifier of getModuleSpecifiers(file)) {
          if (/\/core\/ai\/sandbox\/interface(?:\/|$)/.test(specifier)) {
            forbidden.push(`${displayPath(file)} -> ${specifier}`);
            continue;
          }
          const target = resolveRelativeModule(file, specifier);
          if (target?.startsWith(resolve(sandboxRoot, 'interface') + sep)) {
            forbidden.push(`${displayPath(file)} -> ${displayPath(target)}`);
          }
        }
      }
    }
    expect(forbidden).toEqual([]);
  });

  it('exposes sandbox capabilities to production consumers through interface only', () => {
    const forbidden: string[] = [];
    const productionFiles = [
      ...listTypeScriptFiles(serviceRoot).filter(
        (file) =>
          !file.startsWith(sandboxRoot + sep) &&
          !file.startsWith(resolve(serviceRoot, 'test') + sep)
      ),
      ...listTypeScriptFiles(appSourceRoot)
    ];
    for (const file of productionFiles) {
      for (const specifier of getModuleSpecifiers(file)) {
        if (/\/core\/ai\/sandbox\/(?:application|infrastructure)(?:\/|$)/.test(specifier)) {
          forbidden.push(`${relative(serviceRoot, file)} -> ${specifier}`);
          continue;
        }
        const target = resolveRelativeModule(file, specifier);
        if (
          target &&
          (target.startsWith(resolve(sandboxRoot, 'application') + sep) ||
            target.startsWith(resolve(sandboxRoot, 'infrastructure') + sep))
        ) {
          forbidden.push(`${relative(serviceRoot, file)} -> ${displayPath(target)}`);
        }
      }
    }
    expect(forbidden).toEqual([]);
  });

  it('tests sandbox implementations directly instead of through interface re-exports', () => {
    const forbidden = listTypeScriptFiles(testDirectory)
      .filter((file) => file.endsWith('.test.ts'))
      .flatMap((file) =>
        getModuleSpecifiers(file)
          .filter((specifier) => /\/core\/ai\/sandbox\/interface(?:\/|$)/.test(specifier))
          .map((specifier) => `${displayPath(file)} -> ${specifier}`)
      );

    expect(forbidden).toEqual([]);
  });
});
