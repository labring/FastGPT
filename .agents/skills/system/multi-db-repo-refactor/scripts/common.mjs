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

const parseExpiresDurationSeconds = (val) => {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  if (typeof val !== 'string') {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/i.exec(
    val.trim()
  );
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  if (unit.startsWith('d')) return amount * 86400;
  if (unit.startsWith('h')) return amount * 3600;
  if (unit.startsWith('m')) return amount * 60;
  return amount;
};

const CRITICAL_INDEX_OPTION_KEYS = [
  'unique',
  'sparse',
  'expireAfterSeconds',
  'expires',
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
      if (optKey === 'expires' && val !== undefined) {
        const normalizedSeconds = parseExpiresDurationSeconds(val);
        if (normalizedSeconds !== null && !('expireAfterSeconds' in criticalOptions)) {
          criticalOptions.expireAfterSeconds = normalizedSeconds;
        } else {
          criticalOptions.expires = val;
        }
        continue;
      }
      if (val !== undefined) {
        criticalOptions[optKey] = val;
      }
    }

    const orderedCriticalOptions = Object.fromEntries(
      Object.entries(criticalOptions).sort(([a], [b]) => a.localeCompare(b))
    );

    const keySummary = keyRaw ? keyRaw.replace(/\s+/g, ' ').trim() : '(complex)';
    const signature = JSON.stringify({
      deprecated,
      name: resolvedName ?? null,
      key: keyEntries ?? (parsedKey !== undefined ? parsedKey : keySummary),
      options: orderedCriticalOptions
    });

    results.push({
      deprecated,
      name: resolvedName,
      explicitName,
      derivedName,
      keySummary,
      keyEntries,
      criticalOptions: orderedCriticalOptions,
      signature,
      raw: block
    });

    i = end + 1;
  }

  return results;
};

const srcCharNotNewline = (ch) => ch !== '\n';

const MONGO_MODEL_REG_REGEX = /\b(?:getMongo(?:Log)?Model|connection(?:Log)?Mongo\.model|mongoose\.model)\b/;
const STANDARD_DOMAIN_FILES = new Set([
  'repo.ts',
  'repo.type.ts',
  'service.ts',
  'utils.ts',
  'auth.ts',
  'constants.ts',
  'constant.ts',
  'type.ts',
  'types.ts',
  'index.ts'
]);

/** 从 Schema 源码中提取导出的 Mongoose Model 标识符或惰性工厂函数名。 */
export const extractExportedModelNames = (content) => {
  const clean = stripCommentsPreserveStrings(content);
  const matches = new Set([
    ...[
      ...clean.matchAll(
        /export\s+(?:const|let|function)\s+(Mongo[A-Z][A-Za-z0-9_]*|get[A-Z][A-Za-z0-9_]*MongoModel)\b/g
      )
    ].map((m) => m[1]),
    ...[
      ...clean.matchAll(
        /export\s+(?:const|let|function)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=[\s\S]{0,80}?\bgetMongo(?:Log)?Model\b/g
      )
    ].map((m) => m[1]),
    ...[...clean.matchAll(/export\s+(?:const|function)\s+(get[A-Z][A-Za-z0-9_]*)\b/g)]
      .filter(() => /\bgetMongo(?:Log)?Model\b/.test(clean))
      .map((m) => m[1])
  ]);
  return [...matches];
};

/** 查找目标领域目录下尚未删除的旧版 Mongo Schema / Model 文件（覆盖 schemaV2.ts、ttl.ts 等非标准命名）。 */
export const findSiblingLegacySchemas = (repoRoot, domainDirAbs) => {
  if (!fs.existsSync(domainDirAbs)) {
    return [];
  }
  const entries = fs.readdirSync(domainDirAbs, { withFileTypes: true });
  const legacyRelPaths = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue;
    }
    const fullPath = path.join(domainDirAbs, entry.name);
    const relPath = toPosixPath(path.relative(repoRoot, fullPath));
    if (isTestOrMigrationFile(relPath)) {
      continue;
    }
    if (/schema[^/]*\.ts$/i.test(entry.name)) {
      legacyRelPaths.push(relPath);
      continue;
    }
    if (STANDARD_DOMAIN_FILES.has(entry.name)) {
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    if (MONGO_MODEL_REG_REGEX.test(stripCommentsPreserveStrings(content))) {
      legacyRelPaths.push(relPath);
    }
  }

  return legacyRelPaths.sort();
};

/** 检查全局 WIP=1 锁：查找同时存在 `mongo/schema.ts` 与同目录旧版 Mongo Schema/Model 文件的未合龙域。 */
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
      const legacySchemas = findSiblingLegacySchemas(repoRoot, domainDirAbs);

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

/** 发现全仓尚未迁移或已迁移的 Mongo Schema 与导出 Model 清单（同时识别 schemaV2.ts、ttl.ts 等文件）。 */
export const discoverMongoSchemas = (repoRoot) => {
  const roots = [
    path.join(repoRoot, 'packages/service'),
    path.join(repoRoot, 'pro/admin/src')
  ];

  const models = [];

  for (const base of roots) {
    const candidateFiles = walkFiles(base, (f) => {
      if (!f.endsWith('.ts')) return false;
      const rel = toPosixPath(path.relative(repoRoot, f));
      if (isTestOrMigrationFile(rel) || rel.startsWith('packages/service/common/mongo/')) {
        return false;
      }
      if (/schema[^/]*\.ts$/i.test(path.basename(f))) {
        return true;
      }
      const text = fs.readFileSync(f, 'utf8');
      return MONGO_MODEL_REG_REGEX.test(text);
    });

    for (const absPath of candidateFiles) {
      const relPath = toPosixPath(path.relative(repoRoot, absPath));
      const content = fs.readFileSync(absPath, 'utf8');
      const clean = stripCommentsPreserveStrings(content);
      const isMigrated = relPath.endsWith('/mongo/schema.ts');
      const modelNames = extractExportedModelNames(content);

      if (modelNames.length === 0 && !MONGO_MODEL_REG_REGEX.test(clean)) {
        continue;
      }

      const datasource = /\bgetMongoLogModel\b/.test(clean) ? 'log' : 'main';
      const indexes = extractDefineIndexes(content);
      const hasSoftDelete = /\bdeleteTime\b/.test(clean);
      const hasTtl = /\bexpireAfterSeconds\b|\bexpires\s*:/.test(clean);

      models.push({
        relPath,
        isMigrated,
        datasource,
        hasSoftDelete,
        hasTtl,
        indexes,
        modelNames
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

const resolveMergeBaseCommit = (repoRoot) => {
  for (const candidateRef of ['origin/main', 'main']) {
    try {
      const sha = execFileSync('git', ['merge-base', 'HEAD', candidateRef], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim();
      if (sha.length > 0) {
        return { ok: true, sha };
      }
    } catch {}
  }
  return {
    ok: false,
    error: 'Unable to resolve git merge-base against origin/main or main'
  };
};

/**
 * 从 git 历史对象读取文件文本（支持 `merge-base:<path>`、`<ref>:<path>`，或仅传 `<path>` 时使用 `HEAD:<path>`）。
 * 读取失败时返回包含错误信息的结果对象，调用方不得静默跳过索引比对。
 */
export const readGitLegacyFile = (repoRoot, spec) => {
  const normalized = toPosixPath(spec).trim();
  const separatorIdx = normalized.indexOf(':');
  const rawRef = separatorIdx > 0 ? normalized.slice(0, separatorIdx).trim() : 'HEAD';
  const relPath = (
    separatorIdx > 0 ? normalized.slice(separatorIdx + 1) : normalized
  ).replace(/^\.\//, '');

  const resolvedRefResult = (() => {
    if (rawRef === 'merge-base') {
      return resolveMergeBaseCommit(repoRoot);
    }
    return { ok: true, sha: rawRef };
  })();

  if (!resolvedRefResult.ok) {
    return {
      ok: false,
      objectSpec: `merge-base:${relPath}`,
      relPath,
      error: resolvedRefResult.error
    };
  }

  const objectSpec = `${resolvedRefResult.sha}:${relPath}`;

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

export { stripCommentsPreserveStrings };
