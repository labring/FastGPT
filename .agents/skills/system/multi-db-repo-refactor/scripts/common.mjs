import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** 向上查找仓库根目录（以 pnpm-workspace.yaml 为锚点，兼容 git worktree）。 */
export const findRepoRoot = (startDir = import.meta.dirname) => {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Could not locate FastGPT repository root (pnpm-workspace.yaml not found)');
    }
    current = parent;
  }
};

export const toPosixPath = (p) => p.split(path.sep).join('/');

export const isTestOrMigrationFile = (relPath) => {
  const posix = toPosixPath(relPath);
  return (
    /(^|\/)(test|tests|migration|migrations|__tests__)\//.test(posix) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(posix)
  );
};

/** 递归收集目录下匹配过滤器的文件（相对路径数组）。 */
export const walkFiles = (rootDir, predicate) => {
  const results = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }

  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === 'dist' ||
        entry.name === '.git'
      ) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
};

/**
 * 基于括号平衡精确提取源码中全部 `defineIndex(...)` 声明块，
 * 避免简单正则遇到嵌套 `partialFilterExpression` / `weights` 对象时截断失真。
 */
export const extractDefineIndexes = (sourceText) => {
  const results = [];
  const marker = 'defineIndex(';
  let searchFrom = 0;

  while (true) {
    const idx = sourceText.indexOf(marker, searchFrom);
    if (idx === -1) {
      break;
    }
    let depth = 0;
    let end = idx + marker.length - 1;
    let inQuote = null;
    let escaped = false;

    for (; end < sourceText.length; end += 1) {
      const ch = sourceText[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inQuote !== null) {
        if (ch === '\\') {
          escaped = true;
        } else if (ch === inQuote) {
          inQuote = null;
        }
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inQuote = ch;
        continue;
      }
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }

    const block = sourceText.slice(idx, end + 1);
    const deprecated = /\bdeprecated\s*:\s*true\b/.test(block);
    const keyMatch = /\bkey\s*:\s*(\{[\s\S]*?\})\s*(?:,|\n|\})/.exec(block);
    const nameMatch = /\bname\s*:\s*['"`]([^'"`]+)['"`]/.exec(block);

    results.push({
      deprecated,
      name: nameMatch?.[1],
      keySummary: keyMatch ? keyMatch[1].replace(/\s+/g, ' ').trim() : '(complex)',
      raw: block
    });

    searchFrom = end + 1;
  }

  return results;
};

/** 检查全局 WIP=1 锁：查找同时存在 `mongo/schema.ts` 与同目录旧版 `*schema.ts` 的未合龙域。 */
export const findWipIncompleteDomains = (repoRoot) => {
  const roots = [
    path.join(repoRoot, 'packages/service'),
    path.join(repoRoot, 'pro/admin/src')
  ];
  const wipDomains = [];

  for (const base of roots) {
    const mongoSchemas = walkFiles(base, (f) => toPosixPath(f).endsWith('/mongo/schema.ts'));
    for (const mongoSchemaAbs of mongoSchemas) {
      const domainDirAbs = path.dirname(path.dirname(mongoSchemaAbs));
      const entries = fs.readdirSync(domainDirAbs, { withFileTypes: true });
      const legacySchemas = entries
        .filter((e) => e.isFile() && /schema\.ts$/i.test(e.name))
        .map((e) => toPosixPath(path.relative(repoRoot, path.join(domainDirAbs, e.name))));

      if (legacySchemas.length > 0) {
        wipDomains.push({
          dir: toPosixPath(path.relative(repoRoot, domainDirAbs)),
          mongoSchema: toPosixPath(path.relative(repoRoot, mongoSchemaAbs)),
          legacySchemas
        });
      }
    }
  }

  return wipDomains;
};

/** 发现全仓尚未迁移或已迁移的 Mongo Schema 与导出 Model 清单。 */
export const discoverMongoSchemas = (repoRoot) => {
  const roots = [
    path.join(repoRoot, 'packages/service'),
    path.join(repoRoot, 'pro/admin/src')
  ];

  const models = [];

  for (const base of roots) {
    const schemaFiles = walkFiles(
      base,
      (f) => /schema\.ts$/i.test(path.basename(f)) && !isTestOrMigrationFile(path.relative(repoRoot, f))
    );

    for (const absPath of schemaFiles) {
      const relPath = toPosixPath(path.relative(repoRoot, absPath));
      if (relPath.startsWith('packages/service/common/mongo/')) {
        continue;
      }

      const content = fs.readFileSync(absPath, 'utf8');
      const isMigrated = relPath.endsWith('/mongo/schema.ts');
      const datasource = /\bgetMongoLogModel\b/.test(content) ? 'log' : 'main';
      const indexes = extractDefineIndexes(content);
      const hasSoftDelete = /\bdeleteTime\b/.test(content);
      const hasTtl = /\bexpireAfterSeconds\b|\bexpires\s*:/.test(content);

      const exportMatches = new Set([
        ...[
          ...content.matchAll(
            /export\s+(?:const|let|function)\s+(Mongo[A-Z][A-Za-z0-9_]*|get[A-Z][A-Za-z0-9_]*MongoModel)\b/g
          )
        ].map((m) => m[1]),
        ...[
          ...content.matchAll(
            /export\s+(?:const|let|function)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=[\s\S]{0,60}?\bgetMongo(?:Log)?Model\b/g
          )
        ].map((m) => m[1]),
        ...[
          ...content.matchAll(
            /export\s+(?:const|function)\s+(get[A-Z][A-Za-z0-9_]*)\b/g
          )
        ]
          .filter((m) => /\bgetMongo(?:Log)?Model\b/.test(content))
          .map((m) => m[1])
      ]);

      if (exportMatches.size === 0 && !/getMongo(?:Log)?Model\b/.test(content)) {
        continue;
      }

      models.push({
        relPath,
        isMigrated,
        datasource,
        hasSoftDelete,
        hasTtl,
        indexes,
        modelNames: [...exportMatches]
      });
    }
  }

  return models;
};

/** 运行 ripgrep 并按行返回匹配（无匹配时不抛错）。 */
export const runRg = (args, cwd) => {
  try {
    return execFileSync('rg', args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).trim();
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 1) {
      return '';
    }
    throw error;
  }
};

/** 从 git HEAD 读取历史文件文本（用于验证删除后的旧 schema 索引未丢失）。 */
export const readGitHeadFile = (repoRoot, relPath) => {
  try {
    return execSync(`git show HEAD:${relPath}`, { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    return null;
  }
};
