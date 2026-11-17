import { execFileSync } from 'node:child_process';
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

/** 在保留字符串字面量的前提下，从 JS/TS 源码中剥离 // 与 /* *\/ 注释。 */
const stripCommentsPreserveStrings = (src) => {
  let out = '';
  let i = 0;
  let inQuote = null;
  let escaped = false;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inQuote !== null) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inQuote) {
        inQuote = null;
      }
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
};

/** 扫描并按顶层逗号分隔片段（忽略嵌套括号与字符串内逗号）。 */
const splitTopLevelComma = (src) => {
  const parts = [];
  let current = '';
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inQuote = null;
  let escaped = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuote !== null) {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch;
      current += ch;
      continue;
    }

    if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen -= 1;
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;

    if (ch === ',' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      if (current.trim().length > 0) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
};

/** 查找顶层第一个 `:` 分隔键值对。 */
const findTopLevelColon = (entryText) => {
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inQuote = null;
  let escaped = false;

  for (let i = 0; i < entryText.length; i += 1) {
    const ch = entryText[i];

    if (inQuote !== null) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
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

    if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen -= 1;
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;
    else if (ch === ':' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      return i;
    }
  }

  return -1;
};

const unquoteString = (text) => {
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return null;
  }
  const quote = trimmed[0];
  if ((quote === "'" || quote === '"' || quote === '`') && trimmed[trimmed.length - 1] === quote) {
    if (quote === '`' && trimmed.includes('${')) {
      return null;
    }
    return trimmed.slice(1, -1);
  }
  return null;
};

/** 安全求值纯四则整数/浮点常量表达式（如 `24 * 60 * 60`），不执行任意代码。 */
const evaluateNumericConstExpr = (raw) => {
  const expr = raw.trim();
  if (!/^[0-9+\-*/().\s]+$/.test(expr) || !/\d/.test(expr)) {
    return null;
  }

  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i += 1;
      }
      const val = Number(numStr);
      if (!Number.isFinite(val)) {
        return null;
      }
      tokens.push(val);
      continue;
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    return null;
  }

  let pos = 0;
  const parseExpr = () => {
    let val = parseTerm();
    if (val === null) return null;
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++];
      const rhs = parseTerm();
      if (rhs === null) return null;
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  };
  const parseTerm = () => {
    let val = parseFactor();
    if (val === null) return null;
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++];
      const rhs = parseFactor();
      if (rhs === null) return null;
      if (op === '/' && rhs === 0) return null;
      val = op === '*' ? val * rhs : val / rhs;
    }
    return val;
  };
  const parseFactor = () => {
    const tok = tokens[pos];
    if (tok === '+' || tok === '-') {
      pos += 1;
      const inner = parseFactor();
      if (inner === null) return null;
      return tok === '-' ? -inner : inner;
    }
    if (tok === '(') {
      pos += 1;
      const inner = parseExpr();
      if (inner === null || tokens[pos] !== ')') return null;
      pos += 1;
      return inner;
    }
    if (typeof tok === 'number') {
      pos += 1;
      return tok;
    }
    return null;
  };

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }
  return result;
};

/** 递归解析 JS 字面量表达式为规范 JSON 可比较结构；`preserveKeyOrder` 用于保留索引 key 顺序。 */
const parseJsValue = (rawExpr, { preserveKeyOrder = false } = {}) => {
  const expr = rawExpr.trim();
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  if (expr === 'undefined') return undefined;

  const str = unquoteString(expr);
  if (str !== null) {
    return str;
  }

  const num = evaluateNumericConstExpr(expr);
  if (num !== null) {
    return num;
  }

  if (expr.startsWith('{') && expr.endsWith('}')) {
    const inner = expr.slice(1, -1).trim();
    if (inner.length === 0) {
      return preserveKeyOrder ? [] : {};
    }
    const entries = splitTopLevelComma(inner).map((entry) => {
      const colonIdx = findTopLevelColon(entry);
      if (colonIdx === -1) {
        const key = entry.trim();
        return [key, { expr: key }];
      }
      const rawKey = entry.slice(0, colonIdx).trim();
      const rawVal = entry.slice(colonIdx + 1).trim();
      const normalizedKey = unquoteString(rawKey) ?? rawKey;
      return [normalizedKey, parseJsValue(rawVal, { preserveKeyOrder: false })];
    });
    if (preserveKeyOrder) {
      return entries;
    }
    const sorted = Object.fromEntries(
      entries
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
    );
    return sorted;
  }

  if (expr.startsWith('[') && expr.endsWith(']')) {
    const inner = expr.slice(1, -1).trim();
    if (inner.length === 0) {
      return [];
    }
    return splitTopLevelComma(inner).map((item) => parseJsValue(item, { preserveKeyOrder: false }));
  }

  return { expr: expr.replace(/\s+/g, ' ').trim() };
};

const formatKeyValueToken = (value) => {
  if (typeof value === 'object' && value !== null && 'expr' in value) {
    return value.expr;
  }
  return String(value);
};

const CRITICAL_INDEX_OPTION_KEYS = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
  'weights',
  'default_language',
  'language_override',
  'hidden'
];

/**
 * 基于括号与词法边界精确提取源码中全部 `defineIndex(...)` 声明块，并解析 key、派生/显式名称、
 * deprecated 标记与关键索引 options（unique / sparse / TTL / partialFilterExpression / collation / weights）。
 */
export const extractDefineIndexes = (sourceText) => {
  const results = [];
  const marker = 'defineIndex(';

  let i = 0;
  let inQuote = null;
  let escaped = false;

  while (i < sourceText.length) {
    const ch = sourceText[i];
    const next = sourceText[i + 1];

    if (inQuote !== null) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === inQuote) inQuote = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < sourceText.length && srcCharNotNewline(sourceText[i])) i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sourceText.length && !(sourceText[i] === '*' && sourceText[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    const prevCh = i > 0 ? sourceText[i - 1] : '';
    const isWordBoundary = prevCh === '' || !/[A-Za-z0-9_$]/.test(prevCh);
    if (!isWordBoundary || !sourceText.startsWith(marker, i)) {
      i += 1;
      continue;
    }

    const openParenIdx = i + marker.length - 1;
    let depth = 0;
    let end = openParenIdx;
    let innerQuote = null;
    let innerEscaped = false;

    for (; end < sourceText.length; end += 1) {
      const c = sourceText[end];
      const n = sourceText[end + 1];
      if (innerQuote !== null) {
        if (innerEscaped) innerEscaped = false;
        else if (c === '\\') innerEscaped = true;
        else if (c === innerQuote) innerQuote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        innerQuote = c;
        continue;
      }
      if (c === '/' && n === '/') {
        while (end < sourceText.length && sourceText[end] !== '\n') end += 1;
        continue;
      }
      if (c === '/' && n === '*') {
        end += 2;
        while (end < sourceText.length && !(sourceText[end] === '*' && sourceText[end + 1] === '/')) {
          end += 1;
        }
        end += 1;
        continue;
      }
      if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    const block = sourceText.slice(i, end + 1);
    const argsText = stripCommentsPreserveStrings(sourceText.slice(openParenIdx + 1, end));
    const args = splitTopLevelComma(argsText);
    const defArg = args[1]?.trim() ?? '';

    const defEntries =
      defArg.startsWith('{') && defArg.endsWith('}')
        ? new Map(
            splitTopLevelComma(defArg.slice(1, -1))
              .map((entry) => {
                const colonIdx = findTopLevelColon(entry);
                if (colonIdx === -1) return [entry.trim(), entry.trim()];
                return [
                  unquoteString(entry.slice(0, colonIdx)) ?? entry.slice(0, colonIdx).trim(),
                  entry.slice(colonIdx + 1).trim()
                ];
              })
          )
        : new Map();

    const keyRaw = defEntries.get('key');
    const parsedKey =
      keyRaw !== undefined ? parseJsValue(keyRaw, { preserveKeyOrder: true }) : undefined;
    const keyEntries = Array.isArray(parsedKey) ? parsedKey : null;

    const optionsRaw = defEntries.get('options');
    const parsedOptions =
      optionsRaw !== undefined ? parseJsValue(optionsRaw, { preserveKeyOrder: false }) : {};
    const optionsObj =
      parsedOptions !== null && typeof parsedOptions === 'object' && !Array.isArray(parsedOptions)
        ? parsedOptions
        : { raw: parsedOptions };

    const deprecatedRaw = defEntries.get('deprecated');
    const deprecated = deprecatedRaw !== undefined && parseJsValue(deprecatedRaw) === true;

    const explicitName = (() => {
      if (typeof optionsObj.name === 'string') return optionsObj.name;
      if (optionsObj.name && typeof optionsObj.name === 'object' && 'expr' in optionsObj.name) {
        return optionsObj.name.expr;
      }
      return undefined;
    })();
    const derivedName =
      keyEntries !== null
        ? keyEntries.map(([field, order]) => `${field}_${formatKeyValueToken(order)}`).join('_')
        : undefined;
    const resolvedName = explicitName ?? derivedName;

    const criticalOptions = {};
    for (const optKey of CRITICAL_INDEX_OPTION_KEYS) {
      if (!(optKey in optionsObj)) {
        continue;
      }
      const val = optionsObj[optKey];
      // MongoDB 中 unique: false / sparse: false / hidden: false 等同于未传该选项。
      if ((optKey === 'unique' || optKey === 'sparse' || optKey === 'hidden') && val === false) {
        continue;
      }
      if (val !== undefined) {
        criticalOptions[optKey] = val;
      }
    }

    const keySummary = keyRaw ? keyRaw.replace(/\s+/g, ' ').trim() : '(complex)';
    const signature = JSON.stringify({
      deprecated,
      name: resolvedName ?? null,
      key: keyEntries ?? (parsedKey !== undefined ? parsedKey : keySummary),
      options: criticalOptions
    });

    results.push({
      deprecated,
      name: resolvedName,
      explicitName,
      derivedName,
      keySummary,
      keyEntries,
      criticalOptions,
      signature,
      raw: block
    });

    i = end + 1;
  }

  return results;
};

const srcCharNotNewline = (ch) => ch !== '\n';

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

/**
 * 从 git 历史对象读取文件文本（支持 `<ref>:<path>` 或仅传 `<path>` 时默认使用 `HEAD:<path>`）。
 * 读取失败时返回包含错误信息的结果对象，调用方不得静默跳过索引比对。
 */
export const readGitLegacyFile = (repoRoot, spec) => {
  const normalized = toPosixPath(spec).trim();
  const separatorIdx = normalized.indexOf(':');
  const relPath = (
    separatorIdx > 0 ? normalized.slice(separatorIdx + 1) : normalized
  ).replace(/^\.\//, '');
  const objectSpec =
    separatorIdx > 0 ? `${normalized.slice(0, separatorIdx).trim()}:${relPath}` : `HEAD:${relPath}`;

  try {
    const content = execFileSync('git', ['show', objectSpec], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, objectSpec, relPath, content };
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : '';
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      objectSpec,
      relPath,
      error: stderr || message
    };
  }
};
