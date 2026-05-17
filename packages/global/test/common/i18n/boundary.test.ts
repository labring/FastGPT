import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ignoredDirs = new Set(['coverage', 'node_modules', 'test']);

/**
 * 收集 global 源码文件，排除测试和覆盖率产物，只检查真实包源码的依赖边界。
 */
const collectSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);

    if (entry.startsWith('.') || ignoredDirs.has(entry)) return [];
    if (statSync(fullPath).isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });

describe('global i18n module boundary', () => {
  it('does not import i18nT from web package', () => {
    const files = collectSourceFiles('.');
    const forbidden = ['@fastgpt/web/i18n/utils', '/web/i18n/utils', '../web/i18n/utils'];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(content, `${file} should not contain ${pattern}`).not.toContain(pattern);
      }
    }
  });
});
