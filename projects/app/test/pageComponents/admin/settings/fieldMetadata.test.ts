import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { systemInstanceConfigRegistry } from '@fastgpt/global/common/system/config/registry';
import { adminConfigPageFieldsMap } from '@fastgpt/global/common/system/config/pageFields';

const projectRoot = process.cwd();
const readonlyFields: Record<string, string> = {
  '/admin/subservice/code-sandbox': 'subservice.codeSandbox.baseUrl',
  '/admin/subservice/ai-proxy': 'subservice.aiProxy.endpoint'
};

/**
 * 从真实输入绑定采集页面字段，不把接口回读、默认值或保存时透传的隐藏字段当作控件。
 * 归档字段通过静态数组展开；两个 Text 适配字段在提交时还原为配置数组。
 */
const getRenderedFields = (route: string): Set<string> => {
  const componentPath = route.replace('/settings/pay', '/settings/commercial');
  const file = path.join(projectRoot, 'src/pageComponents', componentPath, 'index.tsx');
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const fields = new Set<string>();
  const textAdapters: Record<string, string> = {
    allowedOriginsText: 'security.allowedOrigins',
    fileUrlWhitelistText: 'security.fileUrlWhitelist'
  };
  const preferredDomain =
    route.split('/').at(-1) === 'pay' ? 'commercial' : route.split('/').at(-1);

  const add = (name: string) => {
    if (textAdapters[name]) {
      fields.add(textAdapters[name]);
      return;
    }
    const matches = systemInstanceConfigRegistry.filter(
      (field) => field.key === name || field.key.endsWith(`.${name}`)
    );
    const field =
      matches.length === 1 ? matches[0] : matches.find((f) => f.section === preferredDomain);
    expect(field, `${route}: unknown or ambiguous form binding ${name}`).toBeDefined();
    fields.add(field!.key);
  };

  const walk = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'name') {
      const tag = node.parent.parent;
      if (ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag)) {
        if (['Controller', 'ImageInput'].includes(tag.tagName.getText(source))) {
          if (node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text);
          if (node.initializer && ts.isJsxExpression(node.initializer)) {
            const expression = node.initializer.expression;
            // 当前唯一的动态输入名来自 datasetArchiveFields；从同一文件的数组读取叶子名。
            if (expression && ts.isTemplateExpression(expression)) {
              expect(expression.head.text).toBe('datasetArchive.');
              const collectArchiveFields = (entry: ts.Node) => {
                if (
                  ts.isPropertyAssignment(entry) &&
                  entry.name.getText(source) === 'name' &&
                  ts.isStringLiteral(entry.initializer)
                ) {
                  add(`datasetArchive.${entry.initializer.text}`);
                }
                ts.forEachChild(entry, collectArchiveFields);
              };
              const declaration = source.statements.find(
                (statement) =>
                  ts.isVariableStatement(statement) &&
                  statement.declarationList.declarations.some(
                    (d) => d.name.getText(source) === 'datasetArchiveFields'
                  )
              );
              expect(declaration).toBeDefined();
              collectArchiveFields(declaration!);
            }
          }
        }
      }
    }
    if (
      ts.isCallExpression(node) &&
      ['register', 'setValue'].includes(node.expression.getText(source))
    ) {
      if (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
        add(node.arguments[0].text);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (readonlyFields[route]) {
    const key = readonlyFields[route];
    expect(text.replaceAll('?.', '.')).toContain(key.replace('subservice.', ''));
    fields.add(key);
  }
  return fields;
};

describe('instance configuration field metadata', () => {
  it.each(Object.keys(adminConfigPageFieldsMap))('matches the actual controls on %s', (route) => {
    const declared = adminConfigPageFieldsMap[route];
    expect(new Set(declared).size).toBe(declared.length);
    expect([...getRenderedFields(route)].sort()).toEqual([...declared].sort());
  });

  it('documents every registered leaf exactly once with matching edition, visibility and page data', () => {
    const doc = fs.readFileSync(
      path.join(projectRoot, '../../.agents/design/common/admin-instance-config-env-boundary.md'),
      'utf8'
    );
    expect(doc).toContain(`**${systemInstanceConfigRegistry.length} 个配置叶子**`);
    const matrix = doc
      .split('<!-- instance-config-field-matrix:start -->')[1]
      .split('<!-- instance-config-field-matrix:end -->')[0];
    const rows = matrix
      .split('\n')
      .filter((line) => /^\| `/.test(line))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim())
      );
    const documented = rows.map(([key]) => key.replaceAll('`', ''));
    expect(new Set(documented).size).toBe(documented.length);
    expect([...documented].sort()).toEqual(systemInstanceConfigRegistry.map((f) => f.key).sort());
    for (const field of systemInstanceConfigRegistry) {
      const row = rows.find(([key]) => key === `\`${field.key}\``)!;
      expect(row[2]).toBe(['all', 'community'].includes(field.edition) ? '✅' : '—');
      expect(row[3]).toBe(['all', 'pro'].includes(field.edition) ? '✅' : '—');
      expect(row[4]).toBe(field.isSaasOnly ? '✅' : '—');
      expect(row[5]).toBe(field.secret ? '✅' : '—');
      const routes = Object.entries(adminConfigPageFieldsMap)
        .filter(([, keys]) => keys.includes(field.key))
        .map(([route]) => route)
        .sort();
      expect([...row[6].matchAll(/`(\/admin\/[^`]+)`/g)].map((m) => m[1]).sort()).toEqual(routes);
      if (routes.length === 0) expect(row[6]).toContain('仅 API');
      if (Object.values(readonlyFields).includes(field.key)) expect(row[6]).toContain('只读');
    }
  });
});
