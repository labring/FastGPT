import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** 开源 CI 不检出私有 Pro 子模块；主仓库始终检查，Pro 源码存在时才追加检查范围。 */
const getSourceScopes = (hasProSources: boolean) => [
  'packages/service',
  'projects/app/src',
  ...(hasProSources ? ['pro/admin/src'] : [])
];
const legacyFields = new Set([
  'systemModelList',
  'systemActiveModelList',
  'systemModelMap',
  'systemDefaultModel',
  'systemConfiguredDefaultModelIds',
  'systemModelCatalogVersion',
  'systemModelRevision',
  'llmModelMap'
]);

describe('model access architecture', () => {
  it('keeps main sources mandatory and only adds the optional Pro checkout when available', () => {
    expect(getSourceScopes(false)).toEqual(['packages/service', 'projects/app/src']);
    expect(getSourceScopes(true)).toEqual([
      'packages/service',
      'projects/app/src',
      'pro/admin/src'
    ]);
  });

  it('keeps production model reads behind getModelHandle without globals or internal cache access', () => {
    const files: string[] = [];
    const collect = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', '.next', 'test', 'tests', 'dist'].includes(entry.name))
          continue;
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) collect(path);
        else if (['.ts', '.tsx'].includes(extname(path)) && !/\.(test|spec)\./.test(path))
          files.push(path);
      }
    };
    for (const scope of getSourceScopes(existsSync(resolve(root, 'pro/admin/src'))))
      collect(resolve(root, scope));
    const violations: string[] = [];
    const allowedInternals = new Set([
      'packages/service/core/ai/model.ts',
      'packages/service/core/ai/config/utils.ts'
    ]);
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const name = relative(root, file);
      const report = (node: ts.Node, reason: string) =>
        violations.push(
          `${name}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${reason}`
        );
      const visit = (node: ts.Node) => {
        if (
          (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
          ts.isIdentifier(node.expression) &&
          ['global', 'globalThis'].includes(node.expression.text)
        ) {
          const key = ts.isPropertyAccessExpression(node)
            ? node.name.text
            : ts.isStringLiteral(node.argumentExpression)
              ? node.argumentExpression.text
              : undefined;
          if (key && legacyFields.has(key)) report(node, 'legacy model global');
        }
        if (
          ts.isVariableDeclaration(node) &&
          node.initializer &&
          ['global', 'globalThis'].includes(node.initializer.getText(source)) &&
          ts.isObjectBindingPattern(node.name)
        ) {
          if (
            node.name.elements.some((entry) =>
              legacyFields.has((entry.propertyName ?? entry.name).getText(source))
            )
          )
            report(node, 'destructured model global');
        }
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const spec = node.moduleSpecifier.text;
          const target = spec.startsWith('@fastgpt/')
            ? resolve(root, 'packages', spec.slice(9) + '.ts')
            : resolve(dirname(file), spec + '.ts');
          const bindings = node.importClause?.namedBindings;
          if (target === resolve(root, 'packages/service/core/ai/model.ts') && bindings) {
            if (
              !ts.isNamedImports(bindings) ||
              bindings.elements.some(
                (entry) =>
                  !['getModelHandle', 'isImageEmbeddingModel'].includes(
                    (entry.propertyName ?? entry.name).text
                  )
              )
            )
              report(node, 'standalone model getter import');
          }
          if (
            target === resolve(root, 'packages/service/core/ai/config/handle.ts') &&
            !allowedInternals.has(name) &&
            bindings &&
            ts.isNamedImports(bindings)
          ) {
            if (
              !node.importClause?.isTypeOnly &&
              bindings.elements.some((entry) => !entry.isTypeOnly)
            )
              report(node, 'private snapshot access');
          }
          if (spec.endsWith('/ai/config/runtime')) report(node, 'removed model read barrier');
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
