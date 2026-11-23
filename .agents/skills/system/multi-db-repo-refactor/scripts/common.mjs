import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const locateWorkspaceRootFrom = (startDir) => {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

/** 向上查找仓库根目录（以 pnpm-workspace.yaml 为锚点，优先当前工作目录以兼容 worktree 与隔离 git 夹具）。 */
export const findRepoRoot = (startDir) => {
  if (startDir !== undefined) {
    const explicit = locateWorkspaceRootFrom(startDir);
    if (explicit !== null) {
      return explicit;
    }
  }
  const fromCwd = locateWorkspaceRootFrom(process.cwd());
  if (fromCwd !== null) {
    return fromCwd;
  }
  const fromScript = locateWorkspaceRootFrom(import.meta.dirname);
  if (fromScript !== null) {
    return fromScript;
  }
  throw new Error('Could not locate FastGPT repository root (pnpm-workspace.yaml not found)');
};

export const toPosixPath = (p) => p.split(path.sep).join('/');

export const isMigrationFile = (relPath) =>
  /(^|\/)(migration|migrations)\//.test(toPosixPath(relPath));

export const isTestFile = (relPath) => {
  const posix = toPosixPath(relPath);
  return /(^|\/)(test|tests|__tests__)\//.test(posix) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(posix);
};

export const isTestOrMigrationFile = (relPath) =>
  isTestFile(relPath) || isMigrationFile(relPath);

/** 明确划出 SQL 适配范围的历史 Mongo 专有 Schema（如 GridFS 历史图片，SQL 模式不建表）。 */
export const OUT_OF_SQL_SCOPE_SCHEMAS = new Set(['packages/service/core/dataset/image/schema.ts']);

/** 根据领域源码目录推导标准测试目录；未知前缀返回 undefined。 */
export const inferDomainTestDir = (domainRel) => {
  const normalized = toPosixPath(domainRel).replace(/^\.\//, '').replace(/\/$/, '');
  if (normalized.startsWith('packages/dal/')) {
    return `packages/dal/test/${normalized.slice('packages/dal/'.length)}`;
  }
  if (normalized.startsWith('packages/service/')) {
    return `packages/service/test/${normalized.slice('packages/service/'.length)}`;
  }
  if (normalized.startsWith('projects/app/src/')) {
    return `projects/app/test/${normalized.slice('projects/app/src/'.length)}`;
  }
  if (normalized.startsWith('pro/admin/src/')) {
    return `pro/admin/test/${normalized.slice('pro/admin/src/'.length)}`;
  }
  return undefined;
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

const IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** 仅缓存不可变 Git commit 历史对象（key 含 repoRoot + gitRef + relPath），工作区文件每次按需读取不跨调用复用。 */
const gitBlobCache = new Map();
const gitExportedStringCache = new Map();

const stripTsAssertion = (raw) => {
  let current = raw.trim();
  while (current.length > 0) {
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;
    let depthAngle = 0;
    let inQuote = null;
    let escaped = false;
    let cutIdx = -1;

    for (let i = 0; i < current.length; i += 1) {
      const ch = current[i];
      if (inQuote !== null) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inQuote = ch;
        continue;
      }
      if (ch === '(') depthParen += 1;
      else if (ch === ')' && depthParen > 0) depthParen -= 1;
      else if (ch === '{') depthBrace += 1;
      else if (ch === '}' && depthBrace > 0) depthBrace -= 1;
      else if (ch === '[') depthBracket += 1;
      else if (ch === ']' && depthBracket > 0) depthBracket -= 1;
      else if (ch === '<') depthAngle += 1;
      else if (ch === '>' && current[i - 1] !== '=' && depthAngle > 0) depthAngle -= 1;

      if (depthParen === 0 && depthBrace === 0 && depthBracket === 0 && depthAngle === 0) {
        const rest = current.slice(i);
        const match = /^(as|satisfies)\s+/.exec(rest);
        if (match !== null && i > 0 && /[\s)\]}"'`A-Za-z0-9_$!]/.test(current[i - 1])) {
          const prevChar = current[i - 1];
          if (!/[A-Za-z0-9_$]/.test(prevChar)) {
            cutIdx = i;
            break;
          }
        }
      }
    }

    let next = cutIdx !== -1 ? current.slice(0, cutIdx).trim() : current;
    if (next.endsWith('!') && !next.endsWith('!=') && !next.endsWith('!==')) {
      next = next.slice(0, -1).trim();
    }
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current;
};

const resolveStringTemplateExpr = ({ expr, localStringConsts, resolvedImportedStrings }) => {
  const literal = unquoteString(expr);
  if (literal !== null) {
    return literal;
  }
  if (expr.startsWith('`') && expr.endsWith('`') && expr.length >= 2) {
    const inner = expr.slice(1, -1);
    let failed = false;
    const interpolated = inner.replace(/\$\{([^}]+)\}/g, (_m, rawIdent) => {
      const ident = rawIdent.trim();
      const val = IDENTIFIER_REGEX.test(ident)
        ? (localStringConsts.get(ident) ?? resolvedImportedStrings.get(ident) ?? null)
        : null;
      if (val === null) {
        failed = true;
        return '';
      }
      return val;
    });
    return failed ? null : interpolated;
  }
  if (IDENTIFIER_REGEX.test(expr)) {
    return localStringConsts.get(expr) ?? resolvedImportedStrings.get(expr) ?? null;
  }
  return null;
};

/** 从指定 Git commit SHA 严格读取 blob 文件内容（目录/不存在均返回 null，绝不回退工作区）。 */
const readGitBlobAtRef = ({ repoRoot, gitRef, relPath }) => {
  const normalizedRel = toPosixPath(relPath).replace(/^\.\//, '');
  const cacheKey = `${repoRoot}::${gitRef}::${normalizedRel}`;
  if (gitBlobCache.has(cacheKey)) {
    return gitBlobCache.get(cacheKey);
  }

  const objectSpec = `${gitRef}:${normalizedRel}`;
  try {
    const objType = execFileSync('git', ['cat-file', '-t', objectSpec], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (objType !== 'blob') {
      gitBlobCache.set(cacheKey, null);
      return null;
    }
    const content = execFileSync('git', ['cat-file', '-p', objectSpec], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    gitBlobCache.set(cacheKey, content);
    return content;
  } catch {
    gitBlobCache.set(cacheKey, null);
    return null;
  }
};

/** 将导入路径解析为仓库相对路径候选项，并按工作区或指定 `gitRef` 严格读取目标文件内容。 */
const resolveImportedTsModule = ({ specifier, repoRoot, sourceRelPath, gitRef }) => {
  if (!repoRoot || !specifier) {
    return null;
  }
  const baseRel = (() => {
    if (specifier.startsWith('@fastgpt/global/')) {
      return `packages/global/${specifier.slice('@fastgpt/global/'.length)}`;
    }
    if (specifier.startsWith('@fastgpt/service/')) {
      return `packages/service/${specifier.slice('@fastgpt/service/'.length)}`;
    }
    if (specifier.startsWith('@/')) {
      const rootSub = sourceRelPath?.startsWith('pro/admin/') ? 'pro/admin/src' : 'projects/app/src';
      return `${rootSub}/${specifier.slice(2)}`;
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && sourceRelPath) {
      const joined = path.posix.normalize(
        path.posix.join(path.posix.dirname(toPosixPath(sourceRelPath)), specifier)
      );
      if (joined.startsWith('..') || path.posix.isAbsolute(joined)) {
        return null;
      }
      return joined;
    }
    return null;
  })();

  if (baseRel === null) {
    return null;
  }

  const normalizedBase = baseRel.replace(/^\.\//, '');
  const candidates = /\.[cm]?[jt]sx?$/.test(normalizedBase)
    ? [normalizedBase]
    : [`${normalizedBase}.ts`, `${normalizedBase}/index.ts`, `${normalizedBase}.tsx`, normalizedBase];

  if (gitRef !== undefined) {
    for (const candidateRel of candidates) {
      const content = readGitBlobAtRef({ repoRoot, gitRef, relPath: candidateRel });
      if (content !== null) {
        return { relPath: candidateRel, content };
      }
    }
    return null;
  }

  for (const candidateRel of candidates) {
    const abs = path.resolve(repoRoot, candidateRel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return { relPath: candidateRel, content: fs.readFileSync(abs, 'utf8') };
    }
  }
  return null;
};

const readExportedStringConsts = ({
  moduleInfo,
  repoRoot,
  gitRef,
  worktreeCache,
  depth = 0
}) => {
  if (!moduleInfo || depth > 3) {
    return new Map();
  }

  const cache = gitRef !== undefined ? gitExportedStringCache : worktreeCache;
  const cacheKey = `${repoRoot}::${gitRef ?? 'worktree'}::${moduleInfo.relPath}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const map = new Map();
  cache.set(cacheKey, map);
  const clean = stripCommentsPreserveStrings(moduleInfo.content);

  for (const match of clean.matchAll(
    /\bexport\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=;]+)?=\s*(['"`][^'"`]*['"`])/g
  )) {
    const val = unquoteString(match[2]);
    if (val !== null) {
      map.set(match[1], val);
    }
  }

  for (const match of clean.matchAll(/\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const childMod = resolveImportedTsModule({
      specifier: match[1],
      repoRoot,
      sourceRelPath: moduleInfo.relPath,
      gitRef
    });
    const childConsts = readExportedStringConsts({
      moduleInfo: childMod,
      repoRoot,
      gitRef,
      worktreeCache,
      depth: depth + 1
    });
    for (const [k, v] of childConsts) {
      if (!map.has(k)) {
        map.set(k, v);
      }
    }
  }

  for (const match of clean.matchAll(/\bexport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const childMod = resolveImportedTsModule({
      specifier: match[2],
      repoRoot,
      sourceRelPath: moduleInfo.relPath,
      gitRef
    });
    const childConsts = readExportedStringConsts({
      moduleInfo: childMod,
      repoRoot,
      gitRef,
      worktreeCache,
      depth: depth + 1
    });
    for (const rawSpec of match[1].split(',')) {
      const trimmed = rawSpec.trim();
      if (!trimmed || trimmed.startsWith('type ')) {
        continue;
      }
      const asParts = trimmed.split(/\s+as\s+/).map((s) => s.trim());
      const origName = asParts[0];
      const exportedName = asParts[1] ?? origName;
      if (childConsts.has(origName) && !map.has(exportedName)) {
        map.set(exportedName, childConsts.get(origName));
      }
    }
  }

  return map;
};

/** 扫描源码中的平衡括号片段（支持 `(` / `<` 等配对符号，忽略字符串字面量内部字符）。 */
const scanBalancedSegment = (src, { startIdx, openChar, closeChar }) => {
  if (src[startIdx] !== openChar) {
    return null;
  }
  let depth = 0;
  let inQuote = null;
  let escaped = false;

  for (let i = startIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuote !== null) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch;
      continue;
    }
    if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return { inner: src.slice(startIdx + 1, i), endIdx: i };
      }
    }
  }
  return null;
};

const skipWhitespace = (src, startIdx) => {
  let cursor = startIdx;
  while (cursor < src.length && /\s/.test(src[cursor])) {
    cursor += 1;
  }
  return cursor;
};

const skipQuotedLiteral = (src, startIdx) => {
  const quote = src[startIdx];
  let escaped = false;
  for (let i = startIdx + 1; i < src.length; i += 1) {
    const ch = src[i];
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === quote) {
      return i;
    }
  }
  return src.length - 1;
};

/** 跳过可选 TS 类型注解，查找位于括号/尖括号深度 0 处的目标分隔符（`=`、`=>` 或 `{`）。 */
const scanToTopLevelToken = ({ src, startIdx, target }) => {
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let depthAngle = 0;

  for (let i = startIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipQuotedLiteral(src, i);
      continue;
    }

    const atTop =
      depthParen === 0 && depthBrace === 0 && depthBracket === 0 && depthAngle === 0;
    if (atTop) {
      if (target === '=>' && ch === '=' && src[i + 1] === '>') {
        return i;
      }
      if (
        target === '=' &&
        ch === '=' &&
        src[i + 1] !== '>' &&
        src[i + 1] !== '=' &&
        src[i - 1] !== '=' &&
        src[i - 1] !== '!' &&
        src[i - 1] !== '<' &&
        src[i - 1] !== '>'
      ) {
        return i;
      }
      if (target === '{' && ch === '{') {
        return i;
      }
      if (ch === ';') {
        return -1;
      }
    }

    if (ch === '(') depthParen += 1;
    else if (ch === ')' && depthParen > 0) depthParen -= 1;
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}' && depthBrace > 0) depthBrace -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']' && depthBracket > 0) depthBracket -= 1;
    else if (ch === '<') depthAngle += 1;
    else if (ch === '>' && src[i - 1] !== '=' && depthAngle > 0) depthAngle -= 1;
  }

  return -1;
};

const NEW_STATEMENT_START_REGEX =
  /^(?:export|const|let|var|function|async\s+function|class|interface|type|return|if|for|while|switch|try|import|defineIndex)\b/;

/** 扫描表达式体箭头函数（无 `{...}`）的精确结束下标，防止作用域越界侵入相邻声明。 */
const scanArrowExprBodyEnd = (src, startIdx) => {
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;

  for (let i = startIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipQuotedLiteral(src, i);
      continue;
    }

    const atTop = depthParen === 0 && depthBrace === 0 && depthBracket === 0;
    if (atTop) {
      if (ch === ';' || ch === ',' || ch === ')' || ch === ']' || ch === '}') {
        return i;
      }
      if (ch === '\n') {
        const nextIdx = skipWhitespace(src, i + 1);
        if (nextIdx >= src.length || NEW_STATEMENT_START_REGEX.test(src.slice(nextIdx))) {
          return i;
        }
      }
    }

    if (ch === '(') depthParen += 1;
    else if (ch === ')' && depthParen > 0) depthParen -= 1;
    else if (ch === '{') depthBrace += 1;
    else if (ch === '}' && depthBrace > 0) depthBrace -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']' && depthBracket > 0) depthBracket -= 1;
  }

  return src.length;
};

/** 精确提取源码中所有命名函数声明与变量赋值函数/箭头函数的函数体字符区间 `[bodyStart, bodyEnd]`。 */
const extractNamedFunctionScopes = (clean) => {
  const scopes = [];

  const parseFunctionBodyAfterSignature = (sigStart) => {
    let cursor = skipWhitespace(clean, sigStart);
    if (clean[cursor] === '<') {
      const genericSeg = scanBalancedSegment(clean, {
        startIdx: cursor,
        openChar: '<',
        closeChar: '>'
      });
      if (genericSeg === null) return null;
      cursor = skipWhitespace(clean, genericSeg.endIdx + 1);
    }
    if (clean[cursor] !== '(') {
      return null;
    }
    const paramSeg = scanBalancedSegment(clean, {
      startIdx: cursor,
      openChar: '(',
      closeChar: ')'
    });
    if (paramSeg === null) return null;

    const braceIdx = scanToTopLevelToken({
      src: clean,
      startIdx: paramSeg.endIdx + 1,
      target: '{'
    });
    if (braceIdx === -1) return null;
    const bodySeg = scanBalancedSegment(clean, {
      startIdx: braceIdx,
      openChar: '{',
      closeChar: '}'
    });
    if (bodySeg === null) return null;
    return { bodyStart: braceIdx, bodyEnd: bodySeg.endIdx };
  };

  // 1. 命名函数声明: `function getFoo(...) { ... }`
  for (const match of clean.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g)) {
    const body = parseFunctionBodyAfterSignature(match.index + match[0].length);
    if (body !== null) {
      scopes.push({ name: match[1], ...body });
    }
  }

  // 2. 变量绑定的函数表达式或箭头函数: `const getFoo = (...) => ...` / `const getFoo = function(...) { ... }`
  for (const match of clean.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g)) {
    const name = match[1];
    const eqIdx = scanToTopLevelToken({
      src: clean,
      startIdx: match.index + match[0].length,
      target: '='
    });
    if (eqIdx === -1) {
      continue;
    }

    let cursor = skipWhitespace(clean, eqIdx + 1);
    if (/^async\b/.test(clean.slice(cursor))) {
      cursor = skipWhitespace(clean, cursor + 'async'.length);
    }

    if (/^function\b/.test(clean.slice(cursor))) {
      cursor = skipWhitespace(clean, cursor + 'function'.length);
      const optNameMatch = clean.slice(cursor).match(/^([A-Za-z_$][A-Za-z0-9_$]*)\b/);
      if (optNameMatch) {
        cursor += optNameMatch[0].length;
      }
      const body = parseFunctionBodyAfterSignature(cursor);
      if (body !== null) {
        scopes.push({ name, ...body });
      }
      continue;
    }

    if (clean[cursor] === '<') {
      const genericSeg = scanBalancedSegment(clean, {
        startIdx: cursor,
        openChar: '<',
        closeChar: '>'
      });
      if (genericSeg === null) continue;
      cursor = skipWhitespace(clean, genericSeg.endIdx + 1);
    }

    let afterParamsIdx = -1;
    if (clean[cursor] === '(') {
      const paramSeg = scanBalancedSegment(clean, {
        startIdx: cursor,
        openChar: '(',
        closeChar: ')'
      });
      if (paramSeg === null) continue;
      afterParamsIdx = paramSeg.endIdx + 1;
    } else {
      const singleParam = clean.slice(cursor).match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/);
      if (singleParam) {
        afterParamsIdx = cursor + singleParam[1].length;
      }
    }

    if (afterParamsIdx === -1) {
      continue;
    }

    const arrowIdx = scanToTopLevelToken({
      src: clean,
      startIdx: afterParamsIdx,
      target: '=>'
    });
    if (arrowIdx === -1) {
      continue;
    }

    const bodyStart = skipWhitespace(clean, arrowIdx + 2);
    if (clean[bodyStart] === '{') {
      const bodySeg = scanBalancedSegment(clean, {
        startIdx: bodyStart,
        openChar: '{',
        closeChar: '}'
      });
      if (bodySeg !== null) {
        scopes.push({ name, bodyStart, bodyEnd: bodySeg.endIdx });
      }
    } else if (bodyStart < clean.length) {
      const bodyEnd = scanArrowExprBodyEnd(clean, bodyStart);
      scopes.push({ name, bodyStart, bodyEnd });
    }
  }

  return scopes;
};

/** 解析源码内 Schema 变量与 MongoDB 集合名的映射关系及潜在归属冲突（严格按 `gitRef` 隔离依赖版本）。 */
const extractSchemaCollectionBindings = ({ sourceText, repoRoot, sourceRelPath, gitRef }) => {
  const clean = stripCommentsPreserveStrings(sourceText);
  const worktreeCache = new Map();
  const localStringConsts = new Map();
  const resolvedImportedStrings = new Map();
  const unresolvedImportedSymbols = new Map();
  const modelFactoryFns = new Set(['getMongoModel', 'getMongoLogModel']);
  const declaredSchemas = new Set();
  const schemaToCollection = new Map();
  const modelRegistrations = [];
  const collectionDefinitions = [];
  const ownershipErrors = [];

  for (const match of clean.matchAll(
    /\b(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=;]+)?=\s*(['"`][^'"`]*['"`])/g
  )) {
    const val = unquoteString(match[2]);
    if (val !== null) {
      localStringConsts.set(match[1], val);
    }
  }

  for (const match of clean.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = match[1];
    const specifier = match[2];
    const importedMod = resolveImportedTsModule({
      specifier,
      repoRoot,
      sourceRelPath,
      gitRef
    });
    const exportedConsts =
      importedMod !== null
        ? readExportedStringConsts({
            moduleInfo: importedMod,
            repoRoot,
            gitRef,
            worktreeCache
          })
        : null;

    for (const rawSpec of clause.split(',')) {
      const trimmed = rawSpec.trim();
      if (!trimmed || trimmed.startsWith('type ')) {
        continue;
      }
      const asParts = trimmed.split(/\s+as\s+/).map((s) => s.trim());
      const importedName = asParts[0];
      const localName = asParts[1] ?? importedName;
      if (importedName === 'getMongoModel' || importedName === 'getMongoLogModel') {
        modelFactoryFns.add(localName);
      }
      if (exportedConsts?.has(importedName)) {
        resolvedImportedStrings.set(localName, exportedConsts.get(importedName));
      } else if (importedMod === null) {
        unresolvedImportedSymbols.set(localName, specifier);
      }
    }
  }

  for (const match of clean.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*new\s+(?:[A-Za-z_$][A-Za-z0-9_$.]*\.)?Schema\s*[<(]/g
  )) {
    declaredSchemas.add(match[1]);
  }

  const escapedFns = [...modelFactoryFns].map((fn) => fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const callRegex = new RegExp(
    `\\b(?:${escapedFns.join('|')}|(?:connection(?:Log)?Mongo|mongoose)\\.model)\\b`,
    'g'
  );

  for (const match of clean.matchAll(callRegex)) {
    let cursor = match.index + match[0].length;
    while (cursor < clean.length && /\s/.test(clean[cursor])) {
      cursor += 1;
    }
    if (clean[cursor] === '<') {
      const genericSeg = scanBalancedSegment(clean, {
        startIdx: cursor,
        openChar: '<',
        closeChar: '>'
      });
      if (genericSeg === null) {
        continue;
      }
      cursor = genericSeg.endIdx + 1;
      while (cursor < clean.length && /\s/.test(clean[cursor])) {
        cursor += 1;
      }
    }
    if (clean[cursor] !== '(') {
      continue;
    }
    const callSeg = scanBalancedSegment(clean, {
      startIdx: cursor,
      openChar: '(',
      closeChar: ')'
    });
    if (callSeg === null) {
      continue;
    }

    const callArgs = splitTopLevelComma(callSeg.inner);
    if (callArgs.length < 2) {
      continue;
    }

    const colExpr = stripTsAssertion(callArgs[0]);
    const schemaExpr = stripTsAssertion(callArgs[1]);

    if (!IDENTIFIER_REGEX.test(schemaExpr)) {
      ownershipErrors.push(
        `Model registration "${match[0]}" uses non-identifier schema argument "${callArgs[1].trim()}"`
      );
      continue;
    }

    const resolvedCol = resolveStringTemplateExpr({
      expr: colExpr,
      localStringConsts,
      resolvedImportedStrings
    });

    if (resolvedCol === null || resolvedCol.length === 0) {
      const missingSpec = unresolvedImportedSymbols.get(colExpr);
      const refHint =
        missingSpec !== undefined && gitRef !== undefined
          ? ` (imported from "${missingSpec}" not found at git ref "${gitRef}")`
          : '';
      ownershipErrors.push(
        `Cannot resolve static collection name "${callArgs[0].trim()}" for schema "${schemaExpr}"${refHint}`
      );
      continue;
    }

    const prevCol = schemaToCollection.get(schemaExpr);
    if (prevCol !== undefined && prevCol !== resolvedCol) {
      ownershipErrors.push(
        `Schema "${schemaExpr}" is registered to multiple collections ("${prevCol}" and "${resolvedCol}")`
      );
      continue;
    }

    schemaToCollection.set(schemaExpr, resolvedCol);
    modelRegistrations.push({
      schemaVar: schemaExpr,
      collection: resolvedCol,
      callIndex: match.index
    });
  }

  // 解析新版纯声明式 defineMongoCollection({ name, datasource, schema, indexes }) 绑定关系（支持同文件 const 描述符与简写属性）
  const collectionResolver = createStaticScopeResolver({
    sourceText,
    repoRoot,
    sourceRelPath,
    gitRef
  });
  for (const call of findFunctionCalls({
    tokens: collectionResolver.tokens,
    matchIdx: collectionResolver.matchIdx,
    calleeNames: new Set(['defineMongoCollection'])
  })) {
    const callArgs = splitTopLevelComma(
      collectionResolver.clean.slice(
        collectionResolver.tokens[call.openParenIdx].end,
        collectionResolver.tokens[call.closeParenIdx].start
      )
    ).filter((arg) => arg.trim().length > 0);
    if (callArgs.length !== 1) {
      ownershipErrors.push(
        `defineMongoCollection call expects 1 descriptor argument (received ${callArgs.length})`
      );
      continue;
    }

    const argStartPos = skipWhitespace(
      collectionResolver.clean,
      collectionResolver.tokens[call.openParenIdx].end
    );
    const objRes = collectionResolver.resolveObjectProperties({
      rawExpr: callArgs[0],
      scopePos: argStartPos
    });
    if (!objRes.ok) {
      ownershipErrors.push(
        `defineMongoCollection call descriptor cannot be statically parsed (${objRes.reason})`
      );
      continue;
    }

    const nameEntry = objRes.props.get('name');
    const schemaEntry = objRes.props.get('schema');
    const indexesEntry = objRes.props.get('indexes');

    const nameExpr = nameEntry !== undefined ? stripTsAssertion(nameEntry.rawValue) : '';
    const schemaExpr = schemaEntry !== undefined ? stripTsAssertion(schemaEntry.rawValue) : '';
    const indexesExpr = indexesEntry !== undefined ? stripTsAssertion(indexesEntry.rawValue) : '';

    const resolvedNameRes =
      nameEntry !== undefined
        ? collectionResolver.resolveValue({
            rawExpr: nameEntry.rawValue,
            scopePos: nameEntry.scopePos
          })
        : { ok: false, reason: 'missing name property' };
    const resolvedCol =
      resolvedNameRes.ok && typeof resolvedNameRes.value === 'string'
        ? resolvedNameRes.value
        : resolveStringTemplateExpr({
            expr: nameExpr,
            localStringConsts,
            resolvedImportedStrings
          });
    if (resolvedCol === null || resolvedCol.length === 0) {
      ownershipErrors.push(
        `Cannot resolve static collection name "${nameExpr}" in defineMongoCollection(...)`
      );
      continue;
    }

    const schemaVar = IDENTIFIER_REGEX.test(schemaExpr) ? schemaExpr : null;
    if (schemaVar !== null) {
      const prevCol = schemaToCollection.get(schemaVar);
      if (prevCol !== undefined && prevCol !== resolvedCol) {
        ownershipErrors.push(
          `Schema "${schemaVar}" is registered to multiple collections ("${prevCol}" and "${resolvedCol}")`
        );
        continue;
      }
      schemaToCollection.set(schemaVar, resolvedCol);
      modelRegistrations.push({
        schemaVar,
        collection: resolvedCol,
        callIndex: collectionResolver.tokens[call.calleeIdx].start
      });
    } else {
      modelRegistrations.push({
        schemaVar: resolvedCol,
        collection: resolvedCol,
        callIndex: collectionResolver.tokens[call.calleeIdx].start
      });
    }

    collectionDefinitions.push({
      collection: resolvedCol,
      schemaVar,
      indexesExpr,
      raw: collectionResolver.clean.slice(
        collectionResolver.tokens[call.calleeIdx].start,
        collectionResolver.tokens[call.closeParenIdx].end
      )
    });
  }

  // 严格按精确语句边界和包含该注册调用的最内层函数作用域绑定 Model/Getter 符号，禁止跨相邻声明猜测
  const functionScopes = extractNamedFunctionScopes(clean);
  const modelSymbolToCollection = new Map();
  const ambiguousModelSymbols = new Set();

  const bindModelSymbol = (symbolName, collection) => {
    if (ambiguousModelSymbols.has(symbolName)) {
      return;
    }
    const prev = modelSymbolToCollection.get(symbolName);
    if (prev !== undefined && prev !== collection) {
      modelSymbolToCollection.delete(symbolName);
      ambiguousModelSymbols.add(symbolName);
      return;
    }
    modelSymbolToCollection.set(symbolName, collection);
  };

  for (const reg of modelRegistrations) {
    // 1. 同语句内直接变量赋值: `const MongoX = getMongoModel(...)`（绝不跨越 `;` / `{` / `}`）
    const beforeCall = clean.slice(0, reg.callIndex);
    const stmtBoundaryIdx = Math.max(
      beforeCall.lastIndexOf(';'),
      beforeCall.lastIndexOf('{'),
      beforeCall.lastIndexOf('}')
    );
    const stmtPrefix = beforeCall.slice(stmtBoundaryIdx + 1);
    const directModel = stmtPrefix.match(
      /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=;{}]+)?=\s*$/
    );
    if (directModel) {
      bindModelSymbol(directModel[1], reg.collection);
    }

    // 2. 包含该注册调用的最内层命名函数作用域（如 `getAMongoModel`；命名函数表达式同区间一并绑定）
    const enclosingScopes = functionScopes
      .filter((scope) => scope.bodyStart <= reg.callIndex && reg.callIndex <= scope.bodyEnd)
      .sort((a, b) => a.bodyEnd - a.bodyStart - (b.bodyEnd - b.bodyStart));

    if (enclosingScopes.length > 0) {
      const minSpan = enclosingScopes[0].bodyEnd - enclosingScopes[0].bodyStart;
      for (const scope of enclosingScopes) {
        if (scope.bodyEnd - scope.bodyStart !== minSpan) {
          break;
        }
        bindModelSymbol(scope.name, reg.collection);
      }
    }
  }

  for (const match of clean.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=;]+)?=\s*(?:await\s+)?([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*\([^)]*\))?\.schema\b/g
  )) {
    const aliasVar = match[1];
    const modelSym = match[2];
    if (ambiguousModelSymbols.has(modelSym)) {
      ownershipErrors.push(
        `Schema alias "${aliasVar}" references ambiguous model symbol "${modelSym}" bound to multiple collections`
      );
      continue;
    }
    const col = modelSymbolToCollection.get(modelSym);
    if (col === undefined) {
      continue;
    }
    const prevCol = schemaToCollection.get(aliasVar);
    if (prevCol !== undefined && prevCol !== col) {
      ownershipErrors.push(
        `Schema alias "${aliasVar}" resolves to multiple collections ("${prevCol}" and "${col}")`
      );
      continue;
    }
    schemaToCollection.set(aliasVar, col);
  }

  return {
    declaredSchemas: [...declaredSchemas],
    schemaToCollection,
    modelRegistrations,
    collectionDefinitions,
    ownershipErrors
  };
};

/** 将单条索引定义对象（`{ key, options?, deprecated? }`）归一化为可精确对比的签名记录。 */
const buildNormalizedIndexRecord = ({ schemaVar, collection, defArg, raw }) => {
  const trimmed = stripTsAssertion(defArg.trim());
  const defEntries =
    trimmed.startsWith('{') && trimmed.endsWith('}')
      ? new Map(
          splitTopLevelComma(trimmed.slice(1, -1)).map((entry) => {
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

  return {
    schemaVar,
    collection,
    deprecated,
    name: resolvedName,
    explicitName,
    derivedName,
    keySummary,
    keyEntries,
    criticalOptions: orderedCriticalOptions,
    signature,
    raw
  };
};

/**
 * 解析源码中的 `defineIndex(...)` 列表及每个索引所属的 Schema / Collection 归属元数据。
 * 当分析 `--git-legacy` 历史文件时必须传入 `gitRef`，确保所有导入常量均从同一历史版本解析。
 */
export const analyzeSchemaIndexes = ({ sourceText, repoRoot, sourceRelPath, gitRef }) => {
  const bindings = extractSchemaCollectionBindings({
    sourceText,
    repoRoot,
    sourceRelPath,
    gitRef
  });
  const ownershipErrors = [...bindings.ownershipErrors];
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
    const rawSchemaArg = stripTsAssertion(args[0] ?? '');
    const schemaVar = IDENTIFIER_REGEX.test(rawSchemaArg) ? rawSchemaArg : null;
    if (schemaVar === null) {
      ownershipErrors.push(
        `defineIndex uses non-identifier schema argument "${(args[0] ?? '').trim()}"`
      );
    }
    const collection = schemaVar !== null ? (bindings.schemaToCollection.get(schemaVar) ?? null) : null;
    const defArg = args[1]?.trim() ?? '';

    results.push(
      buildNormalizedIndexRecord({
        schemaVar,
        collection,
        defArg,
        raw: block
      })
    );

    i = end + 1;
  }

  // 解析 defineMongoCollection({ indexes: [...] }) 中声明的索引条目
  for (const colDef of bindings.collectionDefinitions) {
    if (!colDef.indexesExpr || colDef.indexesExpr.length === 0) {
      continue;
    }
    if (!colDef.indexesExpr.startsWith('[') || !colDef.indexesExpr.endsWith(']')) {
      ownershipErrors.push(
        `defineMongoCollection("${colDef.collection}") indexes must be a static array literal for verification`
      );
      continue;
    }
    const items = splitTopLevelComma(colDef.indexesExpr.slice(1, -1));
    for (const item of items) {
      results.push(
        buildNormalizedIndexRecord({
          schemaVar: colDef.schemaVar,
          collection: colDef.collection,
          defArg: item,
          raw: item
        })
      );
    }
  }

  return {
    indexes: results,
    declaredSchemas: bindings.declaredSchemas,
    modelRegistrations: bindings.modelRegistrations,
    collectionDefinitions: bindings.collectionDefinitions,
    ownershipErrors
  };
};

/**
 * 基于括号与词法边界精确提取源码中全部 `defineIndex(...)` 声明块，并解析所属 Schema/Collection、key、
 * 派生/显式名称、deprecated 标记与关键索引 options（unique / sparse / TTL / partialFilterExpression / collation / weights）。
 */
export const extractDefineIndexes = (sourceText, options = {}) =>
  analyzeSchemaIndexes({ sourceText, ...options }).indexes;

const srcCharNotNewline = (ch) => ch !== '\n';

const MONGO_MODEL_REG_REGEX =
  /\b(?:defineMongoCollection|getMongo(?:Log)?Model|connection(?:Log)?Mongo\.model|mongoose\.model)\b/;
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

/** 从 Schema 源码中提取导出的 Mongoose Model / 集合描述符 / 惰性工厂函数名。 */
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
        /export\s+(?:const|let|function)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=[\s\S]{0,80}?\b(?:getMongo(?:Log)?Model|defineMongoCollection)\b/g
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

/**
 * 检查全局 WIP=1 锁：
 * 1. 同目录同时存在 `mongo/schema.ts` 与旧版 Mongo Schema/Model 文件；
 * 2. 或 `packages/dal/db/repos/<domain>/mongo/schema.ts` 已落地，但 `packages/service`/`pro/admin/src`
 *    中仍残留注册同一集合名的未删旧 Schema 文件。
 */
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

  // 跨包 WIP 检测：若 DAL 已迁移某集合但 service/pro 中仍有注册同一集合名的旧 Schema 未删
  const dalReposRoot = path.join(repoRoot, 'packages/dal/db/repos');
  const dalSchemas = walkFiles(dalReposRoot, (f) => toPosixPath(f).endsWith('/mongo/schema.ts'));
  if (dalSchemas.length > 0) {
    const legacyCollectionToFiles = new Map();
    for (const base of roots) {
      const candidateFiles = walkFiles(base, (f) => {
        if (!f.endsWith('.ts')) return false;
        const rel = toPosixPath(path.relative(repoRoot, f));
        if (
          isTestOrMigrationFile(rel) ||
          rel.startsWith('packages/service/common/mongo/') ||
          rel.endsWith('/mongo/schema.ts')
        ) {
          return false;
        }
        return /schema[^/]*\.ts$/i.test(path.basename(f));
      });
      for (const legacyAbs of candidateFiles) {
        const legacyRel = toPosixPath(path.relative(repoRoot, legacyAbs));
        const raw = fs.readFileSync(legacyAbs, 'utf8');
        const analysis = analyzeSchemaIndexes({
          sourceText: raw,
          repoRoot,
          sourceRelPath: legacyRel
        });
        for (const reg of analysis.modelRegistrations) {
          if (!legacyCollectionToFiles.has(reg.collection)) {
            legacyCollectionToFiles.set(reg.collection, new Set());
          }
          legacyCollectionToFiles.get(reg.collection).add(legacyRel);
        }
      }
    }

    for (const dalSchemaAbs of dalSchemas) {
      const dalSchemaRel = toPosixPath(path.relative(repoRoot, dalSchemaAbs));
      const domainDirAbs = path.dirname(path.dirname(dalSchemaAbs));
      const raw = fs.readFileSync(dalSchemaAbs, 'utf8');
      const analysis = analyzeSchemaIndexes({
        sourceText: raw,
        repoRoot,
        sourceRelPath: dalSchemaRel
      });
      const matchedLegacy = new Set();
      for (const reg of analysis.modelRegistrations) {
        for (const file of legacyCollectionToFiles.get(reg.collection) ?? []) {
          matchedLegacy.add(file);
        }
      }
      if (matchedLegacy.size > 0) {
        wipDomains.push({
          dir: toPosixPath(path.relative(repoRoot, domainDirAbs)),
          mongoSchema: dalSchemaRel,
          legacySchemas: [...matchedLegacy].sort()
        });
      }
    }
  }

  return wipDomains;
};

/** 发现全仓尚未迁移或已迁移的 Mongo Schema 与导出 Model 清单（同时识别 packages/dal/db/repos、schemaV2.ts、ttl.ts 等文件）。 */
export const discoverMongoSchemas = (repoRoot) => {
  const roots = [
    path.join(repoRoot, 'packages/dal/db/repos'),
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

      const datasource = analyzeMongoSchemaDatasource({
        sourceText: content,
        repoRoot,
        sourceRelPath: relPath
      }).datasource;
      const indexes = extractDefineIndexes(content, { repoRoot, sourceRelPath: relPath });
      const hasSoftDelete = /\bdeleteTime\b/.test(clean);
      const hasTtl = /\bexpireAfterSeconds\b|\bexpires\s*:/.test(clean);
      const mongoLegacyOnly = OUT_OF_SQL_SCOPE_SCHEMAS.has(relPath);

      models.push({
        relPath,
        isMigrated,
        mongoLegacyOnly,
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
    try {
      const sha = execFileSync('git', ['rev-parse', '--verify', `${rawRef}^{commit}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim();
      return { ok: true, sha: sha || rawRef };
    } catch (error) {
      const stderr =
        error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : '';
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: stderr || message };
    }
  })();

  if (!resolvedRefResult.ok) {
    return {
      ok: false,
      objectSpec: `${rawRef}:${relPath}`,
      relPath,
      error: resolvedRefResult.error
    };
  }

  const gitRef = resolvedRefResult.sha;
  const objectSpec = `${gitRef}:${relPath}`;

  try {
    const objType = execFileSync('git', ['cat-file', '-t', objectSpec], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (objType !== 'blob') {
      return {
        ok: false,
        objectSpec,
        relPath,
        error: `Git object "${objectSpec}" is "${objType}", expected blob`
      };
    }
    const content = execFileSync('git', ['cat-file', '-p', objectSpec], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, objectSpec, relPath, gitRef, content };
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

const MAX_OB_MYSQL_INDEX_BYTES = 3072;

const estimateSqlColumnIndexBytes = (colDef) => {
  const kind = colDef?.kind;
  const nullableOverhead = colDef?.nullable === true ? 1 : 0;
  switch (kind) {
    case 'entityId':
      return 24 * 4 + 2 + nullableOverhead;
    case 'varchar': {
      const length = typeof colDef.length === 'number' ? colDef.length : 255;
      return length * 4 + 2 + nullableOverhead;
    }
    case 'boolean':
      return 1 + nullableOverhead;
    case 'integer':
      return 4 + nullableOverhead;
    case 'bigint':
    case 'double':
    case 'timestamp':
      return 8 + nullableOverhead;
    default:
      return null;
  }
};

/**
 * 在剥离注释后，进一步将所有字符串/模板字面量替换为 `""` 并移除 `import` 声明，
 * 供静态测试治理检查使用，避免注释、导入语句或普通字符串字面量误匹配真实代码调用。
 */
export const stripImportsAndStrings = (src) => {
  const noComments = stripCommentsPreserveStrings(src);
  let noStrings = '';

  for (let i = 0; i < noComments.length; i += 1) {
    const ch = noComments[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const endIdx = skipQuotedLiteral(noComments, i);
      noStrings += '""';
      i = endIdx;
      continue;
    }
    noStrings += ch;
  }

  return noStrings.replace(/^\s*import\s+(?:type\s+)?(?:[^;]*?\bfrom\s*)?""\s*;?/gm, '');
};

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'in',
  'of',
  'typeof',
  'void',
  'delete',
  'await',
  'yield',
  'else',
  'do',
  'instanceof',
  'new'
]);

const CONTROL_PAREN_KEYWORDS = new Set([
  'if',
  'while',
  'for',
  'switch',
  'with',
  'catch',
  'function'
]);

const NON_METHOD_PREV_KEYWORDS = new Set([
  ...CONTROL_PAREN_KEYWORDS,
  'return',
  'throw',
  'new',
  'await',
  'typeof',
  'void',
  'delete',
  'yield',
  'case',
  'in',
  'of',
  'else',
  'do',
  'export',
  'default',
  'as',
  'satisfies',
  'instanceof'
]);

const EXPR_CONTINUING_PREV_PUNCT = new Set([
  '.',
  '?.',
  '?',
  ':',
  '=',
  '=>',
  '(',
  '[',
  '{',
  ',',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '&&',
  '||',
  '??',
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
  '!',
  '~',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '...'
]);

const EXPR_CONTINUING_PREV_KEYWORDS = new Set([
  'return',
  'await',
  'typeof',
  'void',
  'delete',
  'new',
  'yield',
  'as',
  'satisfies',
  'in',
  'of',
  'instanceof'
]);

const EXPR_CONTINUING_NEXT_PUNCT = new Set([
  '.',
  '?.',
  '?',
  ':',
  '&&',
  '||',
  '??',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
  '(',
  '['
]);

const EXPR_CONTINUING_NEXT_KEYWORDS = new Set(['as', 'satisfies', 'instanceof', 'in']);

const MULTI_CHAR_PUNCTS = [
  '===',
  '!==',
  '>>>',
  '...',
  '=>',
  '?.',
  '??',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**',
  '<<',
  '>>',
  '++',
  '--'
];

const canStartRegexLiteral = (prevTok) => {
  if (prevTok === undefined) {
    return true;
  }
  if (prevTok.type === 'punct') {
    return (
      prevTok.value !== ')' &&
      prevTok.value !== ']' &&
      prevTok.value !== '++' &&
      prevTok.value !== '--'
    );
  }
  if (prevTok.type === 'ident') {
    return REGEX_PRECEDING_KEYWORDS.has(prevTok.value);
  }
  return false;
};

/**
 * 将已去注释的 JS/TS 源码切分为带精确字符偏移与换行标记的 Token 流，并预计算 `()`/`{}`/`[]` 的 O(1) 配对表。
 * 正确处理字符串字面量、嵌套 `${...}` 模板字符串与正则字面量，避免字符串内容干扰词法作用域与调用识别。
 */
const tokenizeCleanJsTs = (clean) => {
  const tokens = [];
  const templateBraceDepthStack = [];
  let i = 0;
  let lineBreakBefore = false;

  const scanTemplateChunk = (startIdx, isContinuation) => {
    let cursor = startIdx + 1;
    let escaped = false;
    while (cursor < clean.length) {
      const ch = clean[cursor];
      if (escaped) {
        escaped = false;
        cursor += 1;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        cursor += 1;
        continue;
      }
      if (ch === '`') {
        const end = cursor + 1;
        tokens.push({
          type: isContinuation ? 'template_tail' : 'template',
          value: clean.slice(startIdx, end),
          start: startIdx,
          end,
          lineBreakBefore
        });
        lineBreakBefore = false;
        return end;
      }
      if (ch === '$' && clean[cursor + 1] === '{') {
        const end = cursor + 2;
        tokens.push({
          type: isContinuation ? 'template_middle' : 'template_head',
          value: clean.slice(startIdx, end),
          start: startIdx,
          end,
          lineBreakBefore
        });
        lineBreakBefore = false;
        templateBraceDepthStack.push(0);
        return end;
      }
      cursor += 1;
    }
    tokens.push({
      type: isContinuation ? 'template_tail' : 'template',
      value: clean.slice(startIdx),
      start: startIdx,
      end: clean.length,
      lineBreakBefore
    });
    lineBreakBefore = false;
    return clean.length;
  };

  while (i < clean.length) {
    const ch = clean[i];

    if (/\s/.test(ch)) {
      if (ch === '\n' || ch === '\r') {
        lineBreakBefore = true;
      }
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const endQuote = skipQuotedLiteral(clean, i);
      const end = Math.min(endQuote + 1, clean.length);
      tokens.push({
        type: 'string',
        value: clean.slice(i, end),
        start: i,
        end,
        lineBreakBefore
      });
      lineBreakBefore = false;
      i = end;
      continue;
    }

    if (ch === '`') {
      i = scanTemplateChunk(i, false);
      continue;
    }

    if (ch === '}' && templateBraceDepthStack.length > 0) {
      const topDepth = templateBraceDepthStack[templateBraceDepthStack.length - 1];
      if (topDepth === 0) {
        templateBraceDepthStack.pop();
        i = scanTemplateChunk(i, true);
        continue;
      }
      templateBraceDepthStack[templateBraceDepthStack.length - 1] = topDepth - 1;
      tokens.push({ type: 'punct', value: '}', start: i, end: i + 1, lineBreakBefore });
      lineBreakBefore = false;
      i += 1;
      continue;
    }

    if (ch === '{' && templateBraceDepthStack.length > 0) {
      templateBraceDepthStack[templateBraceDepthStack.length - 1] += 1;
      tokens.push({ type: 'punct', value: '{', start: i, end: i + 1, lineBreakBefore });
      lineBreakBefore = false;
      i += 1;
      continue;
    }

    if (ch === '/' && canStartRegexLiteral(tokens[tokens.length - 1])) {
      let cursor = i + 1;
      let inCharClass = false;
      let escaped = false;
      let closed = false;
      while (cursor < clean.length) {
        const c = clean[cursor];
        if (c === '\n' || c === '\r') {
          break;
        }
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === '[') {
          inCharClass = true;
        } else if (c === ']') {
          inCharClass = false;
        } else if (c === '/' && !inCharClass) {
          cursor += 1;
          while (cursor < clean.length && /[a-z]/i.test(clean[cursor])) {
            cursor += 1;
          }
          closed = true;
          break;
        }
        cursor += 1;
      }
      if (closed) {
        tokens.push({
          type: 'regex',
          value: clean.slice(i, cursor),
          start: i,
          end: cursor,
          lineBreakBefore
        });
        lineBreakBefore = false;
        i = cursor;
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let cursor = i + 1;
      while (cursor < clean.length && /[A-Za-z0-9_$]/.test(clean[cursor])) {
        cursor += 1;
      }
      tokens.push({
        type: 'ident',
        value: clean.slice(i, cursor),
        start: i,
        end: cursor,
        lineBreakBefore
      });
      lineBreakBefore = false;
      i = cursor;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(clean[i + 1] ?? ''))) {
      let cursor = i + 1;
      while (cursor < clean.length && /[0-9A-Fa-f_xXoObBn.]/.test(clean[cursor])) {
        cursor += 1;
      }
      if ((clean[cursor] === 'e' || clean[cursor] === 'E') && /[+-0-9]/.test(clean[cursor + 1] ?? '')) {
        cursor += 2;
        while (cursor < clean.length && /[0-9_]/.test(clean[cursor])) {
          cursor += 1;
        }
      }
      tokens.push({
        type: 'number',
        value: clean.slice(i, cursor),
        start: i,
        end: cursor,
        lineBreakBefore
      });
      lineBreakBefore = false;
      i = cursor;
      continue;
    }

    let matchedPunct = null;
    for (const p of MULTI_CHAR_PUNCTS) {
      if (clean.startsWith(p, i)) {
        matchedPunct = p;
        break;
      }
    }
    const punctVal = matchedPunct ?? ch;
    tokens.push({
      type: 'punct',
      value: punctVal,
      start: i,
      end: i + punctVal.length,
      lineBreakBefore
    });
    lineBreakBefore = false;
    i += punctVal.length;
  }

  const matchIdx = new Array(tokens.length).fill(-1);
  const stack = [];
  const openToClose = { '(': ')', '{': '}', '[': ']' };

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const tok = tokens[idx];
    if (tok.type !== 'punct') {
      continue;
    }
    if (tok.value === '(' || tok.value === '{' || tok.value === '[') {
      stack.push({ idx, expectedClose: openToClose[tok.value] });
    } else if (tok.value === ')' || tok.value === '}' || tok.value === ']') {
      for (let s = stack.length - 1; s >= 0; s -= 1) {
        if (stack[s].expectedClose === tok.value) {
          const opened = stack[s];
          stack.length = s;
          matchIdx[opened.idx] = idx;
          matchIdx[idx] = opened.idx;
          break;
        }
      }
    }
  }

  return { tokens, matchIdx };
};

const isIdentTok = (tok, name) =>
  tok !== undefined && tok.type === 'ident' && (name === undefined || tok.value === name);

const isPunctTok = (tok, val) =>
  tok !== undefined && tok.type === 'punct' && (val === undefined || tok.value === val);

/** 匹配平衡的 TypeScript 泛型参数 `<...>`；若中途遇到语句分隔符则返回 -1。 */
const tryMatchGenericAngle = ({ tokens, matchIdx, startIdx, rangeEnd = tokens.length }) => {
  if (!isPunctTok(tokens[startIdx], '<')) {
    return -1;
  }
  let depthAngle = 0;
  for (let i = startIdx; i < rangeEnd; i += 1) {
    const tok = tokens[i];
    if (isPunctTok(tok, '(') || isPunctTok(tok, '{') || isPunctTok(tok, '[')) {
      const close = matchIdx[i];
      if (close === -1 || close >= rangeEnd) {
        return -1;
      }
      i = close;
      continue;
    }
    if (isPunctTok(tok, '<')) {
      depthAngle += 1;
      continue;
    }
    if (isPunctTok(tok, '>') || isPunctTok(tok, '>>') || isPunctTok(tok, '>>>')) {
      const count = tok.value.length;
      depthAngle -= count;
      if (depthAngle <= 0) {
        return i;
      }
      continue;
    }
    if (isPunctTok(tok, ';')) {
      return -1;
    }
    if (
      tok.type === 'ident' &&
      (tok.value === 'return' ||
        tok.value === 'const' ||
        tok.value === 'let' ||
        tok.value === 'var' ||
        tok.value === 'if' ||
        tok.value === 'for' ||
        tok.value === 'while' ||
        tok.value === 'throw' ||
        tok.value === 'function')
    ) {
      return -1;
    }
  }
  return -1;
};

/** 扫描表达式结束位置（半开区间 `[startTok, endTok)`），支持自动分号插入（ASI）。 */
const findExprEndTok = ({ tokens, matchIdx, startTok, rangeEnd, stopOnComma = true }) => {
  let i = startTok;
  while (i < rangeEnd) {
    const tok = tokens[i];
    if (i > startTok && tok.lineBreakBefore) {
      const prev = tokens[i - 1];
      const prevContinues =
        (prev.type === 'punct' && EXPR_CONTINUING_PREV_PUNCT.has(prev.value)) ||
        (prev.type === 'ident' && EXPR_CONTINUING_PREV_KEYWORDS.has(prev.value));
      const nextContinues =
        (tok.type === 'punct' && EXPR_CONTINUING_NEXT_PUNCT.has(tok.value)) ||
        (tok.type === 'ident' && EXPR_CONTINUING_NEXT_KEYWORDS.has(tok.value));
      if (!prevContinues && !nextContinues) {
        return i;
      }
    }
    if (
      isPunctTok(tok, ';') ||
      isPunctTok(tok, ')') ||
      isPunctTok(tok, ']') ||
      isPunctTok(tok, '}') ||
      (stopOnComma && isPunctTok(tok, ','))
    ) {
      return i;
    }
    if (isPunctTok(tok, '(') || isPunctTok(tok, '{') || isPunctTok(tok, '[')) {
      const close = matchIdx[i];
      if (close !== -1 && close < rangeEnd) {
        i = close + 1;
        continue;
      }
    }
    i += 1;
  }
  return rangeEnd;
};

/** 按顶层逗号切分 `[startTok, endTok)` 内的 token 子区间（忽略嵌套括号与尖括号）。 */
const splitTokenRangeByComma = ({ tokens, matchIdx, startTok, endTok }) => {
  const ranges = [];
  let segStart = startTok;
  let angleDepth = 0;

  for (let i = startTok; i < endTok; i += 1) {
    const tok = tokens[i];
    if (isPunctTok(tok, '(') || isPunctTok(tok, '{') || isPunctTok(tok, '[')) {
      const close = matchIdx[i];
      if (close !== -1 && close < endTok) {
        i = close;
      }
      continue;
    }
    if (isPunctTok(tok, '<')) {
      angleDepth += 1;
      continue;
    }
    if (isPunctTok(tok, '>') && angleDepth > 0) {
      angleDepth -= 1;
      continue;
    }
    if (isPunctTok(tok, ',') && angleDepth === 0) {
      if (segStart < i) {
        ranges.push([segStart, i]);
      }
      segStart = i + 1;
    }
  }
  if (segStart < endTok) {
    ranges.push([segStart, endTok]);
  }
  return ranges;
};

const findTopLevelPunctInRange = ({ tokens, matchIdx, startTok, endTok, punctVal }) => {
  let angleDepth = 0;
  for (let i = startTok; i < endTok; i += 1) {
    const tok = tokens[i];
    if (isPunctTok(tok, '(') || isPunctTok(tok, '{') || isPunctTok(tok, '[')) {
      const close = matchIdx[i];
      if (close !== -1 && close < endTok) {
        i = close;
      }
      continue;
    }
    if (isPunctTok(tok, '<')) {
      angleDepth += 1;
      continue;
    }
    if (isPunctTok(tok, '>') && angleDepth > 0) {
      angleDepth -= 1;
      continue;
    }
    if (angleDepth === 0 && isPunctTok(tok, punctVal)) {
      return i;
    }
  }
  return -1;
};

/** 递归提取 JS/TS 绑定模式（标识符、对象/数组解构、重命名、默认值、剩余参数）中声明的全部变量名。 */
const extractBindingPatternIds = ({ tokens, matchIdx, startTok, endTok }) => {
  let s = startTok;
  let e = endTok;
  while (s < e && isPunctTok(tokens[s], '...')) {
    s += 1;
  }
  while (e > s && isPunctTok(tokens[e - 1], '?')) {
    e -= 1;
  }
  if (s >= e) {
    return [];
  }

  const first = tokens[s];
  if (first.type === 'ident' && s + 1 === e) {
    return first.value === 'this' ? [] : [first.value];
  }

  if (isPunctTok(first, '{') && matchIdx[s] === e - 1) {
    const ids = [];
    for (const [entryStart, entryEnd] of splitTokenRangeByComma({
      tokens,
      matchIdx,
      startTok: s + 1,
      endTok: e - 1
    })) {
      if (isPunctTok(tokens[entryStart], '...')) {
        ids.push(
          ...extractBindingPatternIds({ tokens, matchIdx, startTok: entryStart + 1, endTok: entryEnd })
        );
        continue;
      }
      const eqIdx = findTopLevelPunctInRange({
        tokens,
        matchIdx,
        startTok: entryStart,
        endTok: entryEnd,
        punctVal: '='
      });
      const colonIdx = findTopLevelPunctInRange({
        tokens,
        matchIdx,
        startTok: entryStart,
        endTok: entryEnd,
        punctVal: ':'
      });
      if (colonIdx !== -1 && (eqIdx === -1 || colonIdx < eqIdx)) {
        const targetEnd = eqIdx !== -1 ? eqIdx : entryEnd;
        ids.push(
          ...extractBindingPatternIds({ tokens, matchIdx, startTok: colonIdx + 1, endTok: targetEnd })
        );
      } else {
        const targetEnd = eqIdx !== -1 ? eqIdx : entryEnd;
        ids.push(
          ...extractBindingPatternIds({ tokens, matchIdx, startTok: entryStart, endTok: targetEnd })
        );
      }
    }
    return ids;
  }

  if (isPunctTok(first, '[') && matchIdx[s] === e - 1) {
    const ids = [];
    for (const [elemStart, elemEnd] of splitTokenRangeByComma({
      tokens,
      matchIdx,
      startTok: s + 1,
      endTok: e - 1
    })) {
      const eqIdx = findTopLevelPunctInRange({
        tokens,
        matchIdx,
        startTok: elemStart,
        endTok: elemEnd,
        punctVal: '='
      });
      const targetEnd = eqIdx !== -1 ? eqIdx : elemEnd;
      ids.push(
        ...extractBindingPatternIds({ tokens, matchIdx, startTok: elemStart, endTok: targetEnd })
      );
    }
    return ids;
  }

  return [];
};

const PARAM_MODIFIER_KEYWORDS = new Set([
  'public',
  'private',
  'protected',
  'readonly',
  'override'
]);

/** 从函数/箭头函数/方法/catch 参数列表 `(...)` 中提取全部形参绑定名（自动跳过 TS 类型注解与修饰符）。 */
const extractParamListBindings = ({ tokens, matchIdx, openParenIdx, closeParenIdx }) => {
  const ids = [];
  for (const [paramStart, paramEnd] of splitTokenRangeByComma({
    tokens,
    matchIdx,
    startTok: openParenIdx + 1,
    endTok: closeParenIdx
  })) {
    let cursor = paramStart;
    while (cursor < paramEnd) {
      if (isPunctTok(tokens[cursor], '@')) {
        cursor += 1;
        while (
          cursor < paramEnd &&
          (tokens[cursor].type === 'ident' || isPunctTok(tokens[cursor], '.'))
        ) {
          cursor += 1;
        }
        if (cursor < paramEnd && isPunctTok(tokens[cursor], '(')) {
          const close = matchIdx[cursor];
          cursor = close !== -1 && close < paramEnd ? close + 1 : cursor + 1;
        }
        continue;
      }
      if (tokens[cursor].type === 'ident' && PARAM_MODIFIER_KEYWORDS.has(tokens[cursor].value)) {
        cursor += 1;
        continue;
      }
      break;
    }
    if (cursor >= paramEnd) {
      continue;
    }

    const colonIdx = findTopLevelPunctInRange({
      tokens,
      matchIdx,
      startTok: cursor,
      endTok: paramEnd,
      punctVal: ':'
    });
    const eqIdx = findTopLevelPunctInRange({
      tokens,
      matchIdx,
      startTok: cursor,
      endTok: paramEnd,
      punctVal: '='
    });
    let patEnd = paramEnd;
    if (colonIdx !== -1 && colonIdx < patEnd) patEnd = colonIdx;
    if (eqIdx !== -1 && eqIdx < patEnd) patEnd = eqIdx;

    ids.push(...extractBindingPatternIds({ tokens, matchIdx, startTok: cursor, endTok: patEnd }));
  }
  return ids;
};

const looksLikeParamList = ({ tokens, matchIdx, openParenIdx, closeParenIdx }) => {
  const items = splitTokenRangeByComma({
    tokens,
    matchIdx,
    startTok: openParenIdx + 1,
    endTok: closeParenIdx
  });
  for (const [start, end] of items) {
    let cursor = start;
    while (
      cursor < end &&
      (isPunctTok(tokens[cursor], '...') ||
        (tokens[cursor].type === 'ident' && PARAM_MODIFIER_KEYWORDS.has(tokens[cursor].value)))
    ) {
      cursor += 1;
    }
    if (cursor >= end) {
      return false;
    }
    const first = tokens[cursor];
    if (
      first.type !== 'ident' &&
      !isPunctTok(first, '{') &&
      !isPunctTok(first, '[') &&
      !isPunctTok(first, '@')
    ) {
      return false;
    }
    if (first.type === 'ident' && cursor + 1 < end) {
      const after = tokens[cursor + 1];
      if (
        !isPunctTok(after, ':') &&
        !isPunctTok(after, '?') &&
        !isPunctTok(after, '=')
      ) {
        return false;
      }
    }
  }
  return true;
};

/** 跳过 TypeScript 类型注解直至顶层目标分隔符（自动平衡 `()`/`{}`/`[]`/`<>`）。 */
const skipTypeAnnotation = ({ tokens, matchIdx, startTok, rangeEnd, stopPuncts }) => {
  let angleDepth = 0;
  for (let i = startTok; i < rangeEnd; i += 1) {
    const tok = tokens[i];
    if (angleDepth === 0 && tok.type === 'punct' && stopPuncts.has(tok.value)) {
      return i;
    }
    if (isPunctTok(tok, '(') || isPunctTok(tok, '{') || isPunctTok(tok, '[')) {
      const close = matchIdx[i];
      if (close !== -1 && close < rangeEnd) {
        i = close;
      }
      continue;
    }
    if (isPunctTok(tok, '<')) {
      angleDepth += 1;
      continue;
    }
    if (isPunctTok(tok, '>') || isPunctTok(tok, '>>') || isPunctTok(tok, '>>>')) {
      if (angleDepth > 0) {
        angleDepth = Math.max(0, angleDepth - tok.value.length);
      }
      continue;
    }
  }
  return rangeEnd;
};

/** 判断 `(` 是否为箭头函数参数列表 `(params) [: ReturnType] =>`。 */
const findArrowAfterParen = ({ tokens, matchIdx, openParenIdx, rangeEnd }) => {
  const prev = openParenIdx > 0 ? tokens[openParenIdx - 1] : undefined;
  if (prev !== undefined && prev.type === 'ident' && CONTROL_PAREN_KEYWORDS.has(prev.value)) {
    return null;
  }
  const closeParenIdx = matchIdx[openParenIdx];
  if (closeParenIdx === -1 || closeParenIdx >= rangeEnd) {
    return null;
  }
  const next = tokens[closeParenIdx + 1];
  if (isPunctTok(next, '=>')) {
    return { closeParenIdx, arrowIdx: closeParenIdx + 1 };
  }
  if (
    isPunctTok(next, ':') &&
    !isPunctTok(prev, '?') &&
    looksLikeParamList({ tokens, matchIdx, openParenIdx, closeParenIdx })
  ) {
    let angleDepth = 0;
    let lastArrowIdx = -1;
    for (let i = closeParenIdx + 2; i < rangeEnd; i += 1) {
      const tok = tokens[i];
      if (isPunctTok(tok, '(') || isPunctTok(tok, '{') || isPunctTok(tok, '[')) {
        if (lastArrowIdx !== -1 && isPunctTok(tok, '{')) {
          return { closeParenIdx, arrowIdx: lastArrowIdx };
        }
        const close = matchIdx[i];
        if (close === -1 || close >= rangeEnd) {
          break;
        }
        i = close;
        continue;
      }
      if (isPunctTok(tok, '<')) {
        angleDepth += 1;
        continue;
      }
      if (isPunctTok(tok, '>') || isPunctTok(tok, '>>') || isPunctTok(tok, '>>>')) {
        if (angleDepth > 0) {
          angleDepth = Math.max(0, angleDepth - tok.value.length);
        }
        continue;
      }
      if (angleDepth === 0) {
        if (isPunctTok(tok, '=>')) {
          lastArrowIdx = i;
          continue;
        }
        if (
          isPunctTok(tok, ';') ||
          isPunctTok(tok, ',') ||
          isPunctTok(tok, ')') ||
          isPunctTok(tok, ']') ||
          isPunctTok(tok, '}') ||
          isPunctTok(tok, '=')
        ) {
          break;
        }
      }
    }
    if (lastArrowIdx !== -1) {
      return { closeParenIdx, arrowIdx: lastArrowIdx };
    }
  }
  return null;
};

/**
 * 构建带精确字符区间 `[start, end]` 的词法作用域树，完整覆盖：
 * - 模块级 / 块级 `const`、`let`、`var`（`var` 自动提升至最近函数/模块作用域）及解构绑定；
 * - 函数声明/表达式、箭头函数（块体与表达式体）、类/对象方法与构造器形参；
 * - `catch (...)` 与 `for (...)` / `for await (...)` 循环绑定；
 * - 跳过 `type` / `interface` / `import type` / `as const` 等纯类型语法。
 */
const buildLexicalScopeTree = ({ clean, tokens, matchIdx }) => {
  let nextScopeId = 1;
  const createScope = ({ kind, parent, start, end }) => {
    const scope = {
      id: nextScopeId++,
      kind,
      parent,
      start,
      end,
      children: [],
      bindings: new Map()
    };
    if (parent !== null) {
      parent.children.push(scope);
    }
    return scope;
  };

  const rootScope = createScope({ kind: 'module', parent: null, start: 0, end: clean.length });

  const findFunctionOrModuleScope = (scope) => {
    let cur = scope;
    while (cur !== null && cur.kind !== 'function' && cur.kind !== 'module') {
      cur = cur.parent;
    }
    return cur ?? rootScope;
  };

  const addBinding = ({ scope, name, info }) => {
    if (!IDENTIFIER_REGEX.test(name)) {
      return;
    }
    const existing = scope.bindings.get(name);
    if (existing === undefined) {
      scope.bindings.set(name, info);
      return;
    }
    // 绝不将已有非 const（形参/可变声明/解构等）升级为静态 const
    if (existing.kind !== 'const') {
      return;
    }
    if (info.kind !== 'const') {
      scope.bindings.set(name, info);
      return;
    }
    scope.bindings.set(name, {
      kind: 'ambiguous',
      detail: 'multiple declarations in the same scope',
      declStart: info.declStart
    });
  };

  const walkRange = ({ startTok, endTok, currentScope }) => {
    for (let i = startTok; i < endTok; i += 1) {
      const tok = tokens[i];
      const prev = i > startTok ? tokens[i - 1] : undefined;
      const next = i + 1 < endTok ? tokens[i + 1] : undefined;

      // 1. import 声明（记录值导入绑定，跳过 import type 与动态 import()）
      if (
        isIdentTok(tok, 'import') &&
        !isPunctTok(prev, '.') &&
        !isPunctTok(prev, '?.') &&
        !isPunctTok(next, '(')
      ) {
        let cursor = i + 1;
        let isTypeOnlyImport = false;
        if (isIdentTok(tokens[cursor], 'type') && !isIdentTok(tokens[cursor + 1], 'from')) {
          isTypeOnlyImport = true;
          cursor += 1;
        }
        const importedIds = [];
        while (cursor < endTok && !isPunctTok(tokens[cursor], ';')) {
          const cur = tokens[cursor];
          if (cur.type === 'string') {
            cursor += 1;
            break;
          }
          if (isIdentTok(cur, 'from')) {
            cursor += 1;
            if (cursor < endTok && tokens[cursor].type === 'string') {
              cursor += 1;
            }
            break;
          }
          if (!isTypeOnlyImport) {
            if (isPunctTok(cur, '*') && isIdentTok(tokens[cursor + 1], 'as') && tokens[cursor + 2]?.type === 'ident') {
              importedIds.push({ name: tokens[cursor + 2].value, start: tokens[cursor + 2].start });
              cursor += 3;
              continue;
            }
            if (isPunctTok(cur, '{') && matchIdx[cursor] !== -1 && matchIdx[cursor] < endTok) {
              const close = matchIdx[cursor];
              for (const [sStart, sEnd] of splitTokenRangeByComma({
                tokens,
                matchIdx,
                startTok: cursor + 1,
                endTok: close
              })) {
                if (isIdentTok(tokens[sStart], 'type')) {
                  continue;
                }
                const localTok =
                  sEnd - sStart >= 3 && isIdentTok(tokens[sStart + 1], 'as')
                    ? tokens[sStart + 2]
                    : tokens[sStart];
                if (localTok?.type === 'ident') {
                  importedIds.push({ name: localTok.value, start: localTok.start });
                }
              }
              cursor = close + 1;
              continue;
            }
            if (cur.type === 'ident') {
              importedIds.push({ name: cur.value, start: cur.start });
            }
          }
          cursor += 1;
        }
        for (const item of importedIds) {
          addBinding({
            scope: rootScope,
            name: item.name,
            info: {
              kind: 'import',
              detail: 'import binding',
              declStart: item.start
            }
          });
        }
        if (isPunctTok(tokens[cursor], ';')) {
          cursor += 1;
        }
        i = cursor - 1;
        continue;
      }

      // 2. 跳过纯 TypeScript 声明：`interface Foo { ... }`、`type Foo = ...`、`export type { ... }`
      if (
        isIdentTok(tok, 'interface') &&
        !isPunctTok(prev, '.') &&
        !isPunctTok(prev, '?.') &&
        next?.type === 'ident'
      ) {
        let cursor = i + 2;
        while (cursor < endTok && !isPunctTok(tokens[cursor], '{') && !isPunctTok(tokens[cursor], ';')) {
          cursor += 1;
        }
        if (isPunctTok(tokens[cursor], '{') && matchIdx[cursor] !== -1 && matchIdx[cursor] < endTok) {
          i = matchIdx[cursor];
          continue;
        }
      }

      if (
        isIdentTok(tok, 'type') &&
        !isPunctTok(prev, '.') &&
        !isPunctTok(prev, '?.') &&
        next?.type === 'ident' &&
        (prev === undefined ||
          tok.lineBreakBefore ||
          isPunctTok(prev, ';') ||
          isPunctTok(prev, '{') ||
          isPunctTok(prev, '}') ||
          isIdentTok(prev, 'export') ||
          isIdentTok(prev, 'declare'))
      ) {
        let cursor = i + 2;
        if (isPunctTok(tokens[cursor], '<')) {
          const closeAngle = tryMatchGenericAngle({
            tokens,
            matchIdx,
            startIdx: cursor,
            rangeEnd: endTok
          });
          if (closeAngle !== -1) {
            cursor = closeAngle + 1;
          }
        }
        if (isPunctTok(tokens[cursor], '=')) {
          const typeEnd = findExprEndTok({
            tokens,
            matchIdx,
            startTok: cursor + 1,
            rangeEnd: endTok,
            stopOnComma: false
          });
          i = typeEnd - 1;
          continue;
        }
      }

      // 3. 变量声明：`const` / `let` / `var`（跳过 `as const`、属性键与成员访问）
      if (
        (isIdentTok(tok, 'const') || isIdentTok(tok, 'let') || isIdentTok(tok, 'var')) &&
        !isPunctTok(prev, '.') &&
        !isPunctTok(prev, '?.') &&
        !isIdentTok(prev, 'as') &&
        next !== undefined &&
        (next.type === 'ident' || isPunctTok(next, '{') || isPunctTok(next, '[')) &&
        !(next.type === 'ident' && isPunctTok(tokens[i + 2], ':') && isPunctTok(prev, '{'))
      ) {
        const declKeyword = tok.value;
        const targetScope =
          declKeyword === 'var' ? findFunctionOrModuleScope(currentScope) : currentScope;
        let cursor = i + 1;

        while (cursor < endTok) {
          const declTok = tokens[cursor];
          if (isPunctTok(declTok, '{') || isPunctTok(declTok, '[')) {
            const close = matchIdx[cursor];
            if (close === -1 || close >= endTok) {
              break;
            }
            const patIds = extractBindingPatternIds({
              tokens,
              matchIdx,
              startTok: cursor,
              endTok: close + 1
            });
            for (const id of patIds) {
              addBinding({
                scope: targetScope,
                name: id,
                info: {
                  kind: declKeyword === 'const' ? 'destructured' : 'mutable',
                  detail:
                    declKeyword === 'const'
                      ? 'const destructuring'
                      : `${declKeyword} declaration`,
                  declStart: declTok.start
                }
              });
            }
            cursor = close + 1;
            if (isPunctTok(tokens[cursor], ':')) {
              cursor = skipTypeAnnotation({
                tokens,
                matchIdx,
                startTok: cursor + 1,
                rangeEnd: endTok,
                stopPuncts: new Set(['=', ',', ';'])
              });
            }
            if (isPunctTok(tokens[cursor], '=')) {
              const initStart = cursor + 1;
              const initEnd = findExprEndTok({
                tokens,
                matchIdx,
                startTok: initStart,
                rangeEnd: endTok,
                stopOnComma: true
              });
              walkRange({ startTok: initStart, endTok: initEnd, currentScope });
              cursor = initEnd;
            }
          } else if (declTok?.type === 'ident') {
            const varName = declTok.value;
            const declStart = declTok.start;
            cursor += 1;
            if (isPunctTok(tokens[cursor], '!')) {
              cursor += 1;
            }
            if (isPunctTok(tokens[cursor], ':')) {
              cursor = skipTypeAnnotation({
                tokens,
                matchIdx,
                startTok: cursor + 1,
                rangeEnd: endTok,
                stopPuncts: new Set(['=', ',', ';'])
              });
            }
            if (isPunctTok(tokens[cursor], '=')) {
              const initStart = cursor + 1;
              const initEnd = findExprEndTok({
                tokens,
                matchIdx,
                startTok: initStart,
                rangeEnd: endTok,
                stopOnComma: true
              });
              if (declKeyword === 'const' && initStart < initEnd) {
                const exprStart = tokens[initStart].start;
                const exprEnd = tokens[initEnd - 1].end;
                addBinding({
                  scope: targetScope,
                  name: varName,
                  info: {
                    kind: 'const',
                    exprText: clean.slice(exprStart, exprEnd).trim(),
                    exprStart,
                    declStart
                  }
                });
              } else {
                addBinding({
                  scope: targetScope,
                  name: varName,
                  info: {
                    kind: 'mutable',
                    detail: `${declKeyword} declaration`,
                    declStart
                  }
                });
              }
              walkRange({ startTok: initStart, endTok: initEnd, currentScope });
              cursor = initEnd;
            } else {
              addBinding({
                scope: targetScope,
                name: varName,
                info: {
                  kind: 'mutable',
                  detail: `${declKeyword} declaration`,
                  declStart
                }
              });
            }
          } else {
            break;
          }

          if (isPunctTok(tokens[cursor], ',')) {
            cursor += 1;
            continue;
          }
          break;
        }
        i = cursor - 1;
        continue;
      }

      // 4. function 声明与函数表达式
      if (
        isIdentTok(tok, 'function') &&
        !isPunctTok(prev, '.') &&
        !isPunctTok(prev, '?.') &&
        !isPunctTok(next, ':')
      ) {
        let cursor = i + 1;
        if (isPunctTok(tokens[cursor], '*')) {
          cursor += 1;
        }
        let fnName = null;
        let fnNameStart = tok.start;
        if (tokens[cursor]?.type === 'ident') {
          fnName = tokens[cursor].value;
          fnNameStart = tokens[cursor].start;
          cursor += 1;
        }
        if (isPunctTok(tokens[cursor], '<')) {
          const closeAngle = tryMatchGenericAngle({
            tokens,
            matchIdx,
            startIdx: cursor,
            rangeEnd: endTok
          });
          if (closeAngle !== -1) {
            cursor = closeAngle + 1;
          }
        }
        if (isPunctTok(tokens[cursor], '(')) {
          const paramOpen = cursor;
          const paramClose = matchIdx[paramOpen];
          if (paramClose !== -1 && paramClose < endTok) {
            let bodyOpen = paramClose + 1;
            if (isPunctTok(tokens[bodyOpen], ':')) {
              bodyOpen = skipTypeAnnotation({
                tokens,
                matchIdx,
                startTok: bodyOpen + 1,
                rangeEnd: endTok,
                stopPuncts: new Set(['{', ';'])
              });
            }
            if (isPunctTok(tokens[bodyOpen], '{') && matchIdx[bodyOpen] !== -1 && matchIdx[bodyOpen] < endTok) {
              const bodyClose = matchIdx[bodyOpen];
              const isExprPos =
                prev !== undefined &&
                ((prev.type === 'punct' &&
                  ['=', '(', '[', ',', ':', '?', '&&', '||', '??', '!', '=>'].includes(
                    prev.value
                  )) ||
                  (prev.type === 'ident' && ['return', 'await', 'default'].includes(prev.value)));
              if (fnName !== null && !isExprPos) {
                addBinding({
                  scope: currentScope,
                  name: fnName,
                  info: {
                    kind: 'function',
                    detail: 'function declaration',
                    declStart: fnNameStart
                  }
                });
              }

              const fnScope = createScope({
                kind: 'function',
                parent: currentScope,
                start: tokens[paramOpen].start,
                end: tokens[bodyClose].end
              });
              if (fnName !== null && isExprPos) {
                addBinding({
                  scope: fnScope,
                  name: fnName,
                  info: {
                    kind: 'function',
                    detail: 'function expression name',
                    declStart: fnNameStart
                  }
                });
              }
              for (const p of extractParamListBindings({
                tokens,
                matchIdx,
                openParenIdx: paramOpen,
                closeParenIdx: paramClose
              })) {
                addBinding({
                  scope: fnScope,
                  name: p,
                  info: {
                    kind: 'param',
                    detail: 'function parameter',
                    declStart: tokens[paramOpen].start
                  }
                });
              }
              walkRange({ startTok: bodyOpen + 1, endTok: bodyClose, currentScope: fnScope });
              i = bodyClose;
              continue;
            }
          }
        }
      }

      // 5. catch (err) { ... } 作用域
      if (isIdentTok(tok, 'catch') && !isPunctTok(prev, '.') && !isPunctTok(prev, '?.')) {
        if (isPunctTok(next, '(')) {
          const paramOpen = i + 1;
          const paramClose = matchIdx[paramOpen];
          if (
            paramClose !== -1 &&
            paramClose + 1 < endTok &&
            isPunctTok(tokens[paramClose + 1], '{')
          ) {
            const bodyOpen = paramClose + 1;
            const bodyClose = matchIdx[bodyOpen];
            if (bodyClose !== -1 && bodyClose < endTok) {
              const catchScope = createScope({
                kind: 'catch',
                parent: currentScope,
                start: tokens[bodyOpen].start,
                end: tokens[bodyClose].end
              });
              for (const p of extractParamListBindings({
                tokens,
                matchIdx,
                openParenIdx: paramOpen,
                closeParenIdx: paramClose
              })) {
                addBinding({
                  scope: catchScope,
                  name: p,
                  info: {
                    kind: 'catch',
                    detail: 'catch clause parameter',
                    declStart: tokens[paramOpen].start
                  }
                });
              }
              walkRange({ startTok: bodyOpen + 1, endTok: bodyClose, currentScope: catchScope });
              i = bodyClose;
              continue;
            }
          }
        }
      }

      // 6. for / for await 循环作用域
      if (isIdentTok(tok, 'for') && !isPunctTok(prev, '.') && !isPunctTok(prev, '?.')) {
        let cursor = i + 1;
        if (isIdentTok(tokens[cursor], 'await')) {
          cursor += 1;
        }
        if (isPunctTok(tokens[cursor], '(')) {
          const headOpen = cursor;
          const headClose = matchIdx[headOpen];
          if (headClose !== -1 && headClose < endTok) {
            const bodyStart = headClose + 1;
            let bodyEnd = bodyStart;
            let bodyIsBlock = false;
            if (bodyStart < endTok && isPunctTok(tokens[bodyStart], '{') && matchIdx[bodyStart] !== -1) {
              bodyEnd = Math.min(matchIdx[bodyStart] + 1, endTok);
              bodyIsBlock = true;
            } else if (bodyStart < endTok) {
              bodyEnd = findExprEndTok({
                tokens,
                matchIdx,
                startTok: bodyStart,
                rangeEnd: endTok,
                stopOnComma: false
              });
              if (bodyEnd < endTok && isPunctTok(tokens[bodyEnd], ';')) {
                bodyEnd += 1;
              }
            }

            const scopeEndChar =
              bodyEnd > bodyStart ? tokens[bodyEnd - 1].end : tokens[headClose].end;
            const forScope = createScope({
              kind: 'for',
              parent: currentScope,
              start: tokens[headOpen].start,
              end: scopeEndChar
            });

            const headFirst = tokens[headOpen + 1];
            if (
              headOpen + 1 < headClose &&
              (isIdentTok(headFirst, 'const') ||
                isIdentTok(headFirst, 'let') ||
                isIdentTok(headFirst, 'var'))
            ) {
              const loopKeyword = headFirst.value;
              const bindTarget =
                loopKeyword === 'var' ? findFunctionOrModuleScope(currentScope) : forScope;
              let declEnd = headClose;
              for (let k = headOpen + 2; k < headClose; k += 1) {
                if (isPunctTok(tokens[k], '(') || isPunctTok(tokens[k], '{') || isPunctTok(tokens[k], '[')) {
                  const c = matchIdx[k];
                  if (c !== -1 && c < headClose) k = c;
                  continue;
                }
                if (
                  isIdentTok(tokens[k], 'of') ||
                  isIdentTok(tokens[k], 'in') ||
                  isPunctTok(tokens[k], ';')
                ) {
                  declEnd = k;
                  break;
                }
              }
              for (const [dStart, dEnd] of splitTokenRangeByComma({
                tokens,
                matchIdx,
                startTok: headOpen + 2,
                endTok: declEnd
              })) {
                const colonIdx = findTopLevelPunctInRange({
                  tokens,
                  matchIdx,
                  startTok: dStart,
                  endTok: dEnd,
                  punctVal: ':'
                });
                const eqIdx = findTopLevelPunctInRange({
                  tokens,
                  matchIdx,
                  startTok: dStart,
                  endTok: dEnd,
                  punctVal: '='
                });
                let patEnd = dEnd;
                if (colonIdx !== -1 && colonIdx < patEnd) patEnd = colonIdx;
                if (eqIdx !== -1 && eqIdx < patEnd) patEnd = eqIdx;
                for (const id of extractBindingPatternIds({
                  tokens,
                  matchIdx,
                  startTok: dStart,
                  endTok: patEnd
                })) {
                  addBinding({
                    scope: bindTarget,
                    name: id,
                    info: {
                      kind: 'mutable',
                      detail:
                        loopKeyword === 'var'
                          ? 'var declaration'
                          : 'for-loop binding',
                      declStart: tokens[dStart].start
                    }
                  });
                }
              }
              if (declEnd + 1 < headClose) {
                walkRange({ startTok: declEnd + 1, endTok: headClose, currentScope: forScope });
              }
            } else {
              walkRange({ startTok: headOpen + 1, endTok: headClose, currentScope: forScope });
            }

            if (bodyIsBlock) {
              walkRange({ startTok: bodyStart + 1, endTok: bodyEnd - 1, currentScope: forScope });
            } else if (bodyStart < bodyEnd) {
              walkRange({ startTok: bodyStart, endTok: bodyEnd, currentScope: forScope });
            }
            i = Math.max(headClose, bodyEnd - 1);
            continue;
          }
        }
      }

      // 7. class 声明与类体作用域
      if (
        isIdentTok(tok, 'class') &&
        !isPunctTok(prev, '.') &&
        !isPunctTok(prev, '?.') &&
        !isPunctTok(next, ':')
      ) {
        let cursor = i + 1;
        if (
          tokens[cursor]?.type === 'ident' &&
          tokens[cursor].value !== 'extends' &&
          tokens[cursor].value !== 'implements'
        ) {
          addBinding({
            scope: currentScope,
            name: tokens[cursor].value,
            info: {
              kind: 'class',
              detail: 'class declaration',
              declStart: tokens[cursor].start
            }
          });
          cursor += 1;
        }
        while (cursor < endTok && !isPunctTok(tokens[cursor], '{')) {
          if (isPunctTok(tokens[cursor], '(') || isPunctTok(tokens[cursor], '[')) {
            const c = matchIdx[cursor];
            if (c !== -1 && c < endTok) cursor = c;
          }
          cursor += 1;
        }
        if (isPunctTok(tokens[cursor], '{') && matchIdx[cursor] !== -1 && matchIdx[cursor] < endTok) {
          const bodyOpen = cursor;
          const bodyClose = matchIdx[bodyOpen];
          const classScope = createScope({
            kind: 'block',
            parent: currentScope,
            start: tokens[bodyOpen].start,
            end: tokens[bodyClose].end
          });
          walkRange({ startTok: bodyOpen + 1, endTok: bodyClose, currentScope: classScope });
          i = bodyClose;
          continue;
        }
      }

      // 8a. 单参数箭头函数：`x => ...`
      if (
        tok.type === 'ident' &&
        isPunctTok(next, '=>') &&
        !isPunctTok(prev, '.') &&
        !isPunctTok(prev, '?.')
      ) {
        const bodyStart = i + 2;
        if (bodyStart < endTok && isPunctTok(tokens[bodyStart], '{') && matchIdx[bodyStart] !== -1) {
          const bodyClose = Math.min(matchIdx[bodyStart], endTok - 1);
          const fnScope = createScope({
            kind: 'function',
            parent: currentScope,
            start: tok.start,
            end: tokens[bodyClose].end
          });
          addBinding({
            scope: fnScope,
            name: tok.value,
            info: {
              kind: 'param',
              detail: 'arrow function parameter',
              declStart: tok.start
            }
          });
          walkRange({ startTok: bodyStart + 1, endTok: bodyClose, currentScope: fnScope });
          i = bodyClose;
          continue;
        }
        if (bodyStart < endTok) {
          const bodyEnd = findExprEndTok({
            tokens,
            matchIdx,
            startTok: bodyStart,
            rangeEnd: endTok,
            stopOnComma: true
          });
          const endChar =
            bodyEnd > bodyStart ? tokens[bodyEnd - 1].end : tokens[bodyStart].end;
          const fnScope = createScope({
            kind: 'function',
            parent: currentScope,
            start: tok.start,
            end: endChar
          });
          addBinding({
            scope: fnScope,
            name: tok.value,
            info: {
              kind: 'param',
              detail: 'arrow function parameter',
              declStart: tok.start
            }
          });
          walkRange({ startTok: bodyStart, endTok: bodyEnd, currentScope: fnScope });
          i = Math.max(bodyStart, bodyEnd - 1);
          continue;
        }
      }

      // 8b. 括号参数箭头函数：`(params) [: ReturnType] => ...`
      if (isPunctTok(tok, '(')) {
        const arrowInfo = findArrowAfterParen({
          tokens,
          matchIdx,
          openParenIdx: i,
          rangeEnd: endTok
        });
        if (arrowInfo !== null) {
          const { closeParenIdx, arrowIdx } = arrowInfo;
          const paramIds = extractParamListBindings({
            tokens,
            matchIdx,
            openParenIdx: i,
            closeParenIdx
          });
          const bodyStart = arrowIdx + 1;
          if (bodyStart < endTok && isPunctTok(tokens[bodyStart], '{') && matchIdx[bodyStart] !== -1) {
            const bodyClose = Math.min(matchIdx[bodyStart], endTok - 1);
            const fnScope = createScope({
              kind: 'function',
              parent: currentScope,
              start: tok.start,
              end: tokens[bodyClose].end
            });
            for (const p of paramIds) {
              addBinding({
                scope: fnScope,
                name: p,
                info: {
                  kind: 'param',
                  detail: 'arrow function parameter',
                  declStart: tok.start
                }
              });
            }
            walkRange({ startTok: bodyStart + 1, endTok: bodyClose, currentScope: fnScope });
            i = bodyClose;
            continue;
          }
          if (bodyStart < endTok) {
            const bodyEnd = findExprEndTok({
              tokens,
              matchIdx,
              startTok: bodyStart,
              rangeEnd: endTok,
              stopOnComma: true
            });
            const endChar =
              bodyEnd > bodyStart ? tokens[bodyEnd - 1].end : tokens[bodyStart].end;
            const fnScope = createScope({
              kind: 'function',
              parent: currentScope,
              start: tok.start,
              end: endChar
            });
            for (const p of paramIds) {
              addBinding({
                scope: fnScope,
                name: p,
                info: {
                  kind: 'param',
                  detail: 'arrow function parameter',
                  declStart: tok.start
                }
              });
            }
            walkRange({ startTok: bodyStart, endTok: bodyEnd, currentScope: fnScope });
            i = Math.max(bodyStart, bodyEnd - 1);
            continue;
          }
        }

        // 9. 类方法 / 对象简写方法 / 构造器：`foo(params) [: Ret] { ... }`
        const closeParenIdx = matchIdx[i];
        const prevCanBeMethodName =
          prev !== undefined &&
          ((prev.type === 'ident' && !NON_METHOD_PREV_KEYWORDS.has(prev.value)) ||
            isPunctTok(prev, '>') ||
            isPunctTok(prev, ']'));
        if (closeParenIdx !== -1 && closeParenIdx < endTok && prevCanBeMethodName) {
          let bodyOpen = closeParenIdx + 1;
          if (isPunctTok(tokens[bodyOpen], ':')) {
            bodyOpen = skipTypeAnnotation({
              tokens,
              matchIdx,
              startTok: bodyOpen + 1,
              rangeEnd: endTok,
              stopPuncts: new Set(['{', ';', ','])
            });
          }
          if (
            bodyOpen < endTok &&
            isPunctTok(tokens[bodyOpen], '{') &&
            matchIdx[bodyOpen] !== -1 &&
            matchIdx[bodyOpen] < endTok
          ) {
            const bodyClose = matchIdx[bodyOpen];
            const methodScope = createScope({
              kind: 'function',
              parent: currentScope,
              start: tok.start,
              end: tokens[bodyClose].end
            });
            for (const p of extractParamListBindings({
              tokens,
              matchIdx,
              openParenIdx: i,
              closeParenIdx
            })) {
              addBinding({
                scope: methodScope,
                name: p,
                info: {
                  kind: 'param',
                  detail: 'method parameter',
                  declStart: tok.start
                }
              });
            }
            walkRange({ startTok: bodyOpen + 1, endTok: bodyClose, currentScope: methodScope });
            i = bodyClose;
            continue;
          }
        }
      }

      // 10. 常规 `{ ... }` 块作用域
      if (isPunctTok(tok, '{')) {
        const bodyClose = matchIdx[i];
        if (bodyClose !== -1 && bodyClose < endTok) {
          const blockScope = createScope({
            kind: 'block',
            parent: currentScope,
            start: tok.start,
            end: tokens[bodyClose].end
          });
          walkRange({ startTok: i + 1, endTok: bodyClose, currentScope: blockScope });
          i = bodyClose;
        }
      }
    }
  };

  walkRange({ startTok: 0, endTok: tokens.length, currentScope: rootScope });

  const findInnermostScope = (charPos) => {
    let best = rootScope;
    const visit = (scope) => {
      if (charPos < scope.start || charPos > scope.end) {
        return;
      }
      if (scope.end - scope.start <= best.end - best.start) {
        best = scope;
      }
      for (const child of scope.children) {
        if (charPos >= child.start && charPos <= child.end) {
          visit(child);
        }
      }
    };
    visit(rootScope);
    return best;
  };

  const lookupBinding = (name, charPos) => {
    const innermost = findInnermostScope(charPos);
    let cur = innermost;
    while (cur !== null) {
      if (cur.bindings.has(name)) {
        return {
          found: true,
          scope: cur,
          innermostScope: innermost,
          binding: cur.bindings.get(name)
        };
      }
      cur = cur.parent;
    }
    return { found: false, scope: null, innermostScope: innermost, binding: null };
  };

  return { rootScope, findInnermostScope, lookupBinding };
};

/** 收集源码中的命名导入映射与跨模块静态字符串常量（遵循可选 `gitRef` 历史隔离）。 */
const collectImportMetadata = ({ clean, repoRoot, sourceRelPath, gitRef }) => {
  const importedStrings = new Map();
  const importedAliases = new Map();
  const worktreeCache = new Map();

  for (const match of clean.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = match[1];
    const specifier = match[2];
    const importedMod =
      repoRoot !== undefined
        ? resolveImportedTsModule({ specifier, repoRoot, sourceRelPath, gitRef })
        : null;
    const exportedConsts =
      importedMod !== null
        ? readExportedStringConsts({
            moduleInfo: importedMod,
            repoRoot,
            gitRef,
            worktreeCache
          })
        : null;

    for (const rawSpec of clause.split(',')) {
      const trimmed = rawSpec.trim();
      if (!trimmed || trimmed.startsWith('type ')) {
        continue;
      }
      const asParts = trimmed.split(/\s+as\s+/).map((s) => s.trim());
      const importedName = asParts[0];
      const localName = asParts[1] ?? importedName;
      importedAliases.set(localName, { importedName, specifier });
      if (exportedConsts?.has(importedName)) {
        importedStrings.set(localName, exportedConsts.get(importedName));
      }
    }
  }

  return { importedStrings, importedAliases };
};

/** 在 Token 流中定位所有指定函数名的真实调用（支持泛型 `<T>`，自动排除字符串、import 与函数声明）。 */
const findFunctionCalls = ({ tokens, matchIdx, calleeNames, allowMemberAccess = false }) => {
  const calls = [];
  let inImportStmt = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;

    if (
      isIdentTok(tok, 'import') &&
      !isPunctTok(prev, '.') &&
      !isPunctTok(prev, '?.') &&
      !isPunctTok(tokens[i + 1], '(')
    ) {
      inImportStmt = true;
      continue;
    }
    if (inImportStmt) {
      if (isPunctTok(tok, ';') || tok.type === 'string') {
        inImportStmt = false;
      }
      continue;
    }

    if (tok.type !== 'ident' || !calleeNames.has(tok.value)) {
      continue;
    }
    if (!allowMemberAccess && (isPunctTok(prev, '.') || isPunctTok(prev, '?.'))) {
      continue;
    }
    if (isIdentTok(prev, 'function')) {
      continue;
    }

    let cursor = i + 1;
    if (isPunctTok(tokens[cursor], '<')) {
      const closeAngle = tryMatchGenericAngle({
        tokens,
        matchIdx,
        startIdx: cursor,
        rangeEnd: tokens.length
      });
      if (closeAngle !== -1) {
        cursor = closeAngle + 1;
      }
    }
    if (!isPunctTok(tokens[cursor], '(')) {
      continue;
    }
    const openParenIdx = cursor;
    const closeParenIdx = matchIdx[openParenIdx];
    calls.push({
      calleeName: tok.value,
      calleeIdx: i,
      openParenIdx,
      closeParenIdx
    });
  }

  return calls;
};

/**
 * 创建词法作用域感知的静态求值器：
 * - 在调用点 `scopePos` 处沿最内层到最外层作用域查找标识符，被函数形参、`let`/`var`、`catch`/`for` 或解构遮蔽时
 *   立即 fail-closed，绝不穿透回退到外层同名 `const`；
 * - 对静态 `const` 绑定切换至其初始化表达式的词法位置递归求值。
 */
export const createStaticScopeResolver = ({
  sourceText,
  repoRoot,
  sourceRelPath,
  gitRef
}) => {
  const clean = stripCommentsPreserveStrings(sourceText);
  const { tokens, matchIdx } = tokenizeCleanJsTs(clean);
  const scopeTree = buildLexicalScopeTree({ clean, tokens, matchIdx });
  const { importedStrings, importedAliases } = collectImportMetadata({
    clean,
    repoRoot,
    sourceRelPath,
    gitRef
  });

  const unwrapOuterParens = (expr) => {
    let current = stripTsAssertion(expr);
    while (current.startsWith('(') && current.endsWith(')')) {
      const seg = scanBalancedSegment(current, { startIdx: 0, openChar: '(', closeChar: ')' });
      if (seg === null || seg.endIdx !== current.length - 1) {
        break;
      }
      current = stripTsAssertion(seg.inner);
    }
    return current;
  };

  /** 静态求值模板字符串 `` `...${expr}...` ``。 */
  const resolveTemplateLiteral = ({ expr, scopePos, visited }) => {
    const inner = expr.slice(1, -1);
    let out = '';
    let i = 0;
    while (i < inner.length) {
      if (inner[i] === '\\' && i + 1 < inner.length) {
        out += inner[i + 1];
        i += 2;
        continue;
      }
      if (inner[i] === '$' && inner[i + 1] === '{') {
        const seg = scanBalancedSegment(inner, {
          startIdx: i + 1,
          openChar: '{',
          closeChar: '}'
        });
        if (seg === null) {
          return { ok: false, reason: `malformed template literal "${expr.slice(0, 60)}"` };
        }
        const subRes = resolveValue({
          rawExpr: seg.inner,
          scopePos,
          visited,
          allowOpaqueIdentifier: false
        });
        if (
          !subRes.ok ||
          (typeof subRes.value !== 'string' &&
            typeof subRes.value !== 'number' &&
            typeof subRes.value !== 'boolean')
        ) {
          return {
            ok: false,
            reason: `template interpolation "\${${seg.inner.trim()}}" is not statically resolvable (${subRes.reason ?? 'non-primitive value'})`
          };
        }
        out += String(subRes.value);
        i = seg.endIdx + 1;
        continue;
      }
      out += inner[i];
      i += 1;
    }
    return { ok: true, value: out };
  };

  /** 递归求值静态 JS 表达式；`topLevelOnlyOpaque` 仅对顶层 `name` 字段放行外部导入标识符。 */
  const resolveValue = ({
    rawExpr,
    scopePos = 0,
    visited = new Set(),
    allowOpaqueIdentifier = false,
    topLevelOnlyOpaque = false
  }) => {
    const expr = unwrapOuterParens(rawExpr);
    if (expr.length === 0) {
      return { ok: false, reason: 'empty expression' };
    }
    if (expr === 'true') return { ok: true, value: true };
    if (expr === 'false') return { ok: true, value: false };
    if (expr === 'null') return { ok: true, value: null };
    if (expr === 'undefined') return { ok: true, value: undefined };

    const str = unquoteString(expr);
    if (str !== null) {
      return { ok: true, value: str };
    }

    if (expr.startsWith('`') && expr.endsWith('`') && expr.length >= 2) {
      return resolveTemplateLiteral({ expr, scopePos, visited });
    }

    const num = evaluateNumericConstExpr(expr);
    if (num !== null) {
      return { ok: true, value: num };
    }

    if (IDENTIFIER_REGEX.test(expr)) {
      const lookup = scopeTree.lookupBinding(expr, scopePos);
      if (lookup.found) {
        const { scope, innermostScope, binding } = lookup;
        if (binding.kind === 'const') {
          const visitKey = `${scope.id}:${expr}`;
          if (visited.has(visitKey)) {
            return { ok: false, reason: `circular local binding "${expr}"` };
          }
          if (scope === innermostScope && binding.declStart > scopePos) {
            return {
              ok: false,
              reason: `identifier "${expr}" is referenced before its const declaration`
            };
          }
          const nextVisited = new Set(visited);
          nextVisited.add(visitKey);
          return resolveValue({
            rawExpr: binding.exprText,
            scopePos: binding.exprStart,
            visited: nextVisited,
            allowOpaqueIdentifier,
            topLevelOnlyOpaque
          });
        }
        if (binding.kind === 'import') {
          if (importedStrings.has(expr)) {
            return { ok: true, value: importedStrings.get(expr) };
          }
          if (allowOpaqueIdentifier) {
            return { ok: true, value: expr };
          }
          return {
            ok: false,
            reason: `identifier "${expr}" is imported and cannot be statically verified`
          };
        }
        return {
          ok: false,
          reason: `identifier "${expr}" is dynamically bound / shadowed by ${binding.detail}`
        };
      }
      if (allowOpaqueIdentifier) {
        return { ok: true, value: expr };
      }
      return { ok: false, reason: `unresolved identifier "${expr}"` };
    }

    if (expr.startsWith('{') && expr.endsWith('}')) {
      const seg = scanBalancedSegment(expr, { startIdx: 0, openChar: '{', closeChar: '}' });
      if (seg === null || seg.endIdx !== expr.length - 1) {
        return { ok: false, reason: `malformed object literal "${expr.slice(0, 60)}"` };
      }
      const inner = seg.inner.trim();
      const result = {};
      if (inner.length === 0) {
        return { ok: true, value: result };
      }
      for (const entry of splitTopLevelComma(inner)) {
        const trimmed = entry.trim();
        if (trimmed.length === 0) {
          continue;
        }
        if (trimmed.startsWith('...')) {
          const spreadRes = resolveValue({
            rawExpr: trimmed.slice(3),
            scopePos,
            visited
          });
          if (
            !spreadRes.ok ||
            spreadRes.value === null ||
            typeof spreadRes.value !== 'object' ||
            Array.isArray(spreadRes.value)
          ) {
            return {
              ok: false,
              reason: `cannot statically expand object spread "${trimmed}" (${spreadRes.reason ?? 'not a plain object'})`
            };
          }
          Object.assign(result, spreadRes.value);
          continue;
        }

        const colonIdx = findTopLevelColon(trimmed);
        if (colonIdx === -1) {
          if (!IDENTIFIER_REGEX.test(trimmed)) {
            return { ok: false, reason: `unsupported object entry "${trimmed}"` };
          }
          const shorthandRes = resolveValue({
            rawExpr: trimmed,
            scopePos,
            visited,
            allowOpaqueIdentifier: topLevelOnlyOpaque && trimmed === 'name'
          });
          if (!shorthandRes.ok) {
            return { ok: false, reason: `property "${trimmed}": ${shorthandRes.reason}` };
          }
          result[trimmed] = shorthandRes.value;
          continue;
        }

        const rawKey = trimmed.slice(0, colonIdx).trim();
        const rawVal = trimmed.slice(colonIdx + 1).trim();
        let key;
        if (rawKey.startsWith('[') && rawKey.endsWith(']')) {
          const keyRes = resolveValue({
            rawExpr: rawKey.slice(1, -1),
            scopePos,
            visited
          });
          if (!keyRes.ok || typeof keyRes.value !== 'string') {
            return { ok: false, reason: `computed or dynamic property key "${rawKey}"` };
          }
          key = keyRes.value;
        } else {
          key = unquoteString(rawKey) ?? rawKey;
          if (!IDENTIFIER_REGEX.test(key) && unquoteString(rawKey) === null) {
            return { ok: false, reason: `computed or dynamic property key "${rawKey}"` };
          }
        }
        const valRes = resolveValue({
          rawExpr: rawVal,
          scopePos,
          visited,
          allowOpaqueIdentifier: topLevelOnlyOpaque && key === 'name'
        });
        if (!valRes.ok) {
          return { ok: false, reason: `property "${key}": ${valRes.reason}` };
        }
        result[key] = valRes.value;
      }
      return { ok: true, value: result };
    }

    if (expr.startsWith('[') && expr.endsWith(']')) {
      const seg = scanBalancedSegment(expr, { startIdx: 0, openChar: '[', closeChar: ']' });
      if (seg === null || seg.endIdx !== expr.length - 1) {
        return { ok: false, reason: `malformed array literal "${expr.slice(0, 60)}"` };
      }
      const inner = seg.inner.trim();
      const items = [];
      if (inner.length === 0) {
        return { ok: true, value: items };
      }
      for (const entry of splitTopLevelComma(inner)) {
        const trimmed = entry.trim();
        if (trimmed.length === 0) {
          continue;
        }
        if (trimmed.startsWith('...')) {
          const spreadRes = resolveValue({
            rawExpr: trimmed.slice(3),
            scopePos,
            visited
          });
          if (!spreadRes.ok || !Array.isArray(spreadRes.value)) {
            return {
              ok: false,
              reason: `cannot statically expand array spread "${trimmed}" (${spreadRes.reason ?? 'not an array'})`
            };
          }
          items.push(...spreadRes.value);
          continue;
        }
        const itemRes = resolveValue({ rawExpr: trimmed, scopePos, visited });
        if (!itemRes.ok) {
          return itemRes;
        }
        items.push(itemRes.value);
      }
      return { ok: true, value: items };
    }

    return { ok: false, reason: `non-static expression "${expr.slice(0, 80)}"` };
  };

  /**
   * 解析对象描述符的顶层属性表（支持同文件 `const` 描述符、对象展开与简写属性），
   * 允许不关注的兄弟属性为运行期表达式（如 `schema: new Schema(...)`、`tables: [tbl]`）。
   */
  const resolveObjectProperties = ({ rawExpr, scopePos = 0, visited = new Set() }) => {
    const expr = unwrapOuterParens(rawExpr);
    if (expr.length === 0) {
      return { ok: false, reason: 'empty descriptor expression' };
    }

    if (IDENTIFIER_REGEX.test(expr)) {
      const lookup = scopeTree.lookupBinding(expr, scopePos);
      if (!lookup.found) {
        return { ok: false, reason: `unresolved identifier "${expr}"` };
      }
      const { scope, innermostScope, binding } = lookup;
      if (binding.kind !== 'const') {
        return {
          ok: false,
          reason: `identifier "${expr}" is dynamically bound / shadowed by ${binding.detail}`
        };
      }
      const visitKey = `${scope.id}:${expr}`;
      if (visited.has(visitKey)) {
        return { ok: false, reason: `circular local binding "${expr}"` };
      }
      if (scope === innermostScope && binding.declStart > scopePos) {
        return {
          ok: false,
          reason: `identifier "${expr}" is referenced before its const declaration`
        };
      }
      const nextVisited = new Set(visited);
      nextVisited.add(visitKey);
      return resolveObjectProperties({
        rawExpr: binding.exprText,
        scopePos: binding.exprStart,
        visited: nextVisited
      });
    }

    if (!expr.startsWith('{') || !expr.endsWith('}')) {
      return { ok: false, reason: `non-static object expression "${expr.slice(0, 80)}"` };
    }
    const seg = scanBalancedSegment(expr, { startIdx: 0, openChar: '{', closeChar: '}' });
    if (seg === null || seg.endIdx !== expr.length - 1) {
      return { ok: false, reason: `malformed object literal "${expr.slice(0, 60)}"` };
    }

    const props = new Map();
    const inner = seg.inner.trim();
    if (inner.length === 0) {
      return { ok: true, props, rawObject: expr, scopePos };
    }

    for (const entry of splitTopLevelComma(inner)) {
      const trimmed = entry.trim();
      if (trimmed.length === 0) {
        continue;
      }
      if (trimmed.startsWith('...')) {
        const spreadRes = resolveObjectProperties({
          rawExpr: trimmed.slice(3),
          scopePos,
          visited
        });
        if (!spreadRes.ok) {
          return {
            ok: false,
            reason: `cannot statically expand object spread "${trimmed}" (${spreadRes.reason})`
          };
        }
        for (const [k, v] of spreadRes.props) {
          props.set(k, v);
        }
        continue;
      }

      const colonIdx = findTopLevelColon(trimmed);
      if (colonIdx === -1) {
        if (IDENTIFIER_REGEX.test(trimmed)) {
          props.set(trimmed, { rawValue: trimmed, scopePos, isShorthand: true, isGetter: false });
          continue;
        }
        const getterMatch = /^get\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(trimmed);
        if (getterMatch !== null) {
          props.set(getterMatch[1], {
            rawValue: trimmed,
            scopePos,
            isShorthand: false,
            isGetter: true
          });
        }
        continue;
      }

      const rawKey = trimmed.slice(0, colonIdx).trim();
      const rawVal = trimmed.slice(colonIdx + 1).trim();
      let key;
      if (rawKey.startsWith('[') && rawKey.endsWith(']')) {
        const keyRes = resolveValue({ rawExpr: rawKey.slice(1, -1), scopePos, visited });
        if (!keyRes.ok || typeof keyRes.value !== 'string') {
          return { ok: false, reason: `computed or dynamic property key "${rawKey}"` };
        }
        key = keyRes.value;
      } else {
        key = unquoteString(rawKey) ?? rawKey;
        if (!IDENTIFIER_REGEX.test(key) && unquoteString(rawKey) === null) {
          return { ok: false, reason: `computed or dynamic property key "${rawKey}"` };
        }
      }
      props.set(key, { rawValue: rawVal, scopePos, isShorthand: false, isGetter: false });
    }

    return { ok: true, props, rawObject: expr, scopePos };
  };

  return {
    clean,
    tokens,
    matchIdx,
    scopeTree,
    importedStrings,
    importedAliases,
    resolveValue,
    resolveObjectProperties
  };
};

/**
 * 静态解析 `mongo/schema.ts` 的数据源归属（`'main'` | `'log'`）：
 * - 支持 `defineMongoCollection({ datasource: 'log' })`、对象简写 `{ datasource }`、同文件/导入常量与本地 `const` 描述符；
 * - 遇到无法静态解析的描述符、动态 `datasource` 表达式、非法值或被遮蔽变量时显式报错，绝不静默回退 `'main'`。
 */
export const analyzeMongoSchemaDatasource = ({
  sourceText,
  repoRoot,
  sourceRelPath,
  gitRef
}) => {
  const resolver = createStaticScopeResolver({
    sourceText,
    repoRoot,
    sourceRelPath,
    gitRef
  });
  const defineColNames = new Set(['defineMongoCollection']);
  const logModelNames = new Set(['getMongoLogModel']);

  for (const [localName, info] of resolver.importedAliases) {
    if (info.importedName === 'defineMongoCollection') {
      defineColNames.add(localName);
    }
    if (info.importedName === 'getMongoLogModel') {
      logModelNames.add(localName);
    }
  }

  const collections = [];
  const errors = [];

  for (const call of findFunctionCalls({
    tokens: resolver.tokens,
    matchIdx: resolver.matchIdx,
    calleeNames: defineColNames
  })) {
    if (call.closeParenIdx === -1) {
      errors.push('malformed defineMongoCollection(...) call (unclosed parenthesis)');
      continue;
    }
    const inner = resolver.clean.slice(
      resolver.tokens[call.openParenIdx].end,
      resolver.tokens[call.closeParenIdx].start
    );
    const callArgs = splitTopLevelComma(inner).filter((arg) => arg.trim().length > 0);
    if (callArgs.length !== 1) {
      errors.push(
        `cannot statically parse defineMongoCollection(...): expected 1 descriptor argument, received ${callArgs.length}`
      );
      continue;
    }

    const argStartPos = skipWhitespace(resolver.clean, resolver.tokens[call.openParenIdx].end);
    const objRes = resolver.resolveObjectProperties({
      rawExpr: callArgs[0],
      scopePos: argStartPos
    });
    if (!objRes.ok) {
      errors.push(
        `cannot statically parse defineMongoCollection(...) descriptor: ${objRes.reason}`
      );
      continue;
    }

    const nameEntry = objRes.props.get('name');
    const resolvedName =
      nameEntry !== undefined
        ? resolver.resolveValue({ rawExpr: nameEntry.rawValue, scopePos: nameEntry.scopePos })
        : { ok: false };
    const colLabel =
      resolvedName.ok && typeof resolvedName.value === 'string'
        ? `"${resolvedName.value}"`
        : '(unnamed)';

    const dsEntry = objRes.props.get('datasource');
    if (dsEntry === undefined) {
      collections.push({ name: colLabel, datasource: 'main' });
      continue;
    }
    if (dsEntry.isGetter) {
      errors.push(
        `cannot statically resolve defineMongoCollection(${colLabel}) datasource: getter property is not statically verifiable`
      );
      continue;
    }

    const dsRes = resolver.resolveValue({
      rawExpr: dsEntry.rawValue,
      scopePos: dsEntry.scopePos,
      allowOpaqueIdentifier: false
    });
    if (!dsRes.ok) {
      errors.push(
        `cannot statically resolve defineMongoCollection(${colLabel}) datasource "${dsEntry.rawValue}": ${dsRes.reason}`
      );
      continue;
    }
    if (dsRes.value === undefined) {
      collections.push({ name: colLabel, datasource: 'main' });
      continue;
    }
    if (dsRes.value !== 'main' && dsRes.value !== 'log') {
      errors.push(
        `invalid defineMongoCollection(${colLabel}) datasource ${JSON.stringify(dsRes.value)} (expected 'main' or 'log')`
      );
      continue;
    }
    collections.push({ name: colLabel, datasource: dsRes.value });
  }

  const logModelCalls = findFunctionCalls({
    tokens: resolver.tokens,
    matchIdx: resolver.matchIdx,
    calleeNames: logModelNames
  });
  const hasLegacyLogModel = logModelCalls.length > 0;
  const isLogDomain = hasLegacyLogModel || collections.some((c) => c.datasource === 'log');

  return {
    datasource: isLogDomain ? 'log' : 'main',
    isLogDomain,
    collections,
    errors
  };
};

const CLASS_FIELD_MODIFIERS = new Set([
  'public',
  'protected',
  'private',
  'readonly',
  'override',
  'static',
  'declare',
  'abstract',
  'accessor'
]);

/**
 * 静态解析 `sql/repo.ts` 类字段/getter 上的 `datasource` 声明（支持同文件与导入常量，拒绝遮蔽/动态表达式）。
 */
export const analyzeSqlRepoDatasource = ({ sourceText, repoRoot, sourceRelPath }) => {
  const resolver = createStaticScopeResolver({
    sourceText,
    repoRoot,
    sourceRelPath
  });
  const { clean, tokens, matchIdx } = resolver;
  const declarations = [];
  const errors = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;
    if (!isIdentTok(tok, 'class') || isPunctTok(prev, '.') || isPunctTok(prev, '?.')) {
      continue;
    }
    let cursor = i + 1;
    while (cursor < tokens.length && !isPunctTok(tokens[cursor], '{')) {
      if (isPunctTok(tokens[cursor], '(') || isPunctTok(tokens[cursor], '[')) {
        const c = matchIdx[cursor];
        if (c !== -1) cursor = c;
      }
      cursor += 1;
    }
    if (!isPunctTok(tokens[cursor], '{') || matchIdx[cursor] === -1) {
      continue;
    }
    const bodyOpen = cursor;
    const bodyClose = matchIdx[bodyOpen];

    let memberIdx = bodyOpen + 1;
    while (memberIdx < bodyClose) {
      if (isPunctTok(tokens[memberIdx], ';')) {
        memberIdx += 1;
        continue;
      }
      let isStatic = false;
      let isGetter = false;
      while (memberIdx < bodyClose && tokens[memberIdx].type === 'ident') {
        const val = tokens[memberIdx].value;
        if (CLASS_FIELD_MODIFIERS.has(val)) {
          if (val === 'static') isStatic = true;
          memberIdx += 1;
          continue;
        }
        if (val === 'get' && isIdentTok(tokens[memberIdx + 1], 'datasource')) {
          isGetter = true;
          memberIdx += 1;
          continue;
        }
        break;
      }

      if (memberIdx >= bodyClose) {
        break;
      }
      const memberTok = tokens[memberIdx];

      if (!isStatic && isIdentTok(memberTok, 'datasource')) {
        let nextIdx = memberIdx + 1;
        if (isGetter && isPunctTok(tokens[nextIdx], '(') && matchIdx[nextIdx] !== -1) {
          let getterBodyOpen = matchIdx[nextIdx] + 1;
          if (isPunctTok(tokens[getterBodyOpen], ':')) {
            getterBodyOpen = skipTypeAnnotation({
              tokens,
              matchIdx,
              startTok: getterBodyOpen + 1,
              rangeEnd: bodyClose,
              stopPuncts: new Set(['{', ';'])
            });
          }
          if (isPunctTok(tokens[getterBodyOpen], '{') && matchIdx[getterBodyOpen] !== -1) {
            const getterBodyClose = matchIdx[getterBodyOpen];
            if (isIdentTok(tokens[getterBodyOpen + 1], 'return')) {
              const retStart = getterBodyOpen + 2;
              const retEnd = findExprEndTok({
                tokens,
                matchIdx,
                startTok: retStart,
                rangeEnd: getterBodyClose,
                stopOnComma: false
              });
              const rawExpr =
                retStart < retEnd
                  ? clean.slice(tokens[retStart].start, tokens[retEnd - 1].end).trim()
                  : '';
              const dsRes = resolver.resolveValue({
                rawExpr,
                scopePos: retStart < retEnd ? tokens[retStart].start : tokens[getterBodyOpen].start,
                allowOpaqueIdentifier: false
              });
              if (!dsRes.ok) {
                const msg = `cannot statically resolve sql/repo.ts datasource "${rawExpr}": ${dsRes.reason}`;
                errors.push(msg);
                declarations.push({ rawExpr, resolved: null, error: msg });
              } else if (dsRes.value !== 'main' && dsRes.value !== 'log') {
                const msg = `invalid sql/repo.ts datasource ${JSON.stringify(dsRes.value)} (expected 'main' or 'log')`;
                errors.push(msg);
                declarations.push({ rawExpr, resolved: null, error: msg });
              } else {
                declarations.push({ rawExpr, resolved: dsRes.value, error: null });
              }
            } else {
              const msg = 'cannot statically resolve sql/repo.ts datasource getter body';
              errors.push(msg);
              declarations.push({ rawExpr: 'get datasource()', resolved: null, error: msg });
            }
            memberIdx = getterBodyClose + 1;
            continue;
          }
        } else if (!isPunctTok(tokens[nextIdx], '(')) {
          if (isPunctTok(tokens[nextIdx], '?') || isPunctTok(tokens[nextIdx], '!')) {
            nextIdx += 1;
          }
          if (isPunctTok(tokens[nextIdx], ':')) {
            nextIdx = skipTypeAnnotation({
              tokens,
              matchIdx,
              startTok: nextIdx + 1,
              rangeEnd: bodyClose,
              stopPuncts: new Set(['=', ';'])
            });
          }
          if (isPunctTok(tokens[nextIdx], '=')) {
            const initStart = nextIdx + 1;
            const initEnd = findExprEndTok({
              tokens,
              matchIdx,
              startTok: initStart,
              rangeEnd: bodyClose,
              stopOnComma: false
            });
            const rawExpr =
              initStart < initEnd
                ? clean.slice(tokens[initStart].start, tokens[initEnd - 1].end).trim()
                : '';
            const dsRes = resolver.resolveValue({
              rawExpr,
              scopePos: initStart < initEnd ? tokens[initStart].start : memberTok.start,
              allowOpaqueIdentifier: false
            });
            if (!dsRes.ok) {
              const msg = `cannot statically resolve sql/repo.ts datasource "${rawExpr}": ${dsRes.reason}`;
              errors.push(msg);
              declarations.push({ rawExpr, resolved: null, error: msg });
            } else if (dsRes.value !== 'main' && dsRes.value !== 'log') {
              const msg = `invalid sql/repo.ts datasource ${JSON.stringify(dsRes.value)} (expected 'main' or 'log')`;
              errors.push(msg);
              declarations.push({ rawExpr, resolved: null, error: msg });
            } else {
              declarations.push({ rawExpr, resolved: dsRes.value, error: null });
            }
            memberIdx = initEnd;
            continue;
          }
        }
      }

      // 跳过当前类成员（方法体或字段初始化，先跳过字段/返回值 TS 类型注解避免误截断）
      let scan = memberIdx;
      while (scan < bodyClose) {
        if (isPunctTok(tokens[scan], ';')) {
          scan += 1;
          break;
        }
        if (isPunctTok(tokens[scan], ':')) {
          scan = skipTypeAnnotation({
            tokens,
            matchIdx,
            startTok: scan + 1,
            rangeEnd: bodyClose,
            stopPuncts: new Set(['=', '{', ';'])
          });
          continue;
        }
        if (isPunctTok(tokens[scan], '{') && matchIdx[scan] !== -1) {
          scan = matchIdx[scan] + 1;
          break;
        }
        if (isPunctTok(tokens[scan], '(') || isPunctTok(tokens[scan], '[')) {
          const c = matchIdx[scan];
          if (c !== -1 && c < bodyClose) {
            scan = c + 1;
            continue;
          }
        }
        if (scan > memberIdx && tokens[scan].lineBreakBefore) {
          const prevMemberTok = tokens[scan - 1];
          const prevContinues =
            (prevMemberTok.type === 'punct' &&
              EXPR_CONTINUING_PREV_PUNCT.has(prevMemberTok.value)) ||
            (prevMemberTok.type === 'ident' &&
              EXPR_CONTINUING_PREV_KEYWORDS.has(prevMemberTok.value));
          if (!prevContinues) {
            break;
          }
        }
        scan += 1;
      }
      memberIdx = Math.max(memberIdx + 1, scan);
    }

    i = bodyClose;
  }

  return {
    declarations,
    errors,
    hasLogDatasource: declarations.some((d) => d.resolved === 'log'),
    hasMainDatasource: declarations.some((d) => d.resolved === 'main')
  };
};

/**
 * 静态解析 `sql/table.ts` 中的全部 `defineSqlTable(...)` 声明并校验 OceanBase/MySQL 硬约束：
 * - 基于词法作用域树解析内联对象字面量、局部 `const` 变量、局部对象展开与 `as const` / `satisfies` 断言；
 * - 若标识符被函数/箭头函数/方法形参、内层 `let`/`var`、解构或动态 `const` 遮蔽，立即 fail-closed 报错，绝不穿透到外层 `const`；
 * - 禁止给 `text` / `json` 列声明 `defaultValue`（OB/MySQL `ERROR 1101`）；
 * - 禁止对 `text` / `json` 列建普通 B-Tree 索引；
 * - 校验单条普通/唯一复合索引在 `utf8mb4` 下的最大估算字节宽不超过 3072 字节。
 */
export const analyzeSqlTableDefinitions = (sourceText) => {
  const resolver = createStaticScopeResolver({ sourceText });
  const { clean, tokens, matchIdx, importedAliases } = resolver;
  const tables = [];
  const issues = [];

  const defineSqlTableNames = new Set(['defineSqlTable']);
  for (const [localName, info] of importedAliases) {
    if (info.importedName === 'defineSqlTable') {
      defineSqlTableNames.add(localName);
    }
  }

  for (const call of findFunctionCalls({
    tokens,
    matchIdx,
    calleeNames: defineSqlTableNames
  })) {
    if (call.closeParenIdx === -1) {
      issues.push('malformed defineSqlTable(...) call (unclosed parenthesis)');
      continue;
    }

    const inner = clean.slice(tokens[call.openParenIdx].end, tokens[call.closeParenIdx].start);
    const callArgs = splitTopLevelComma(inner).filter((arg) => arg.trim().length > 0);
    const rawArgSummary = (callArgs[0] ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const argStartPos = skipWhitespace(clean, tokens[call.openParenIdx].end);

    const resolvedTable =
      callArgs.length === 1
        ? resolver.resolveValue({
            rawExpr: callArgs[0],
            scopePos: argStartPos,
            topLevelOnlyOpaque: true
          })
        : {
            ok: false,
            reason:
              callArgs.length === 0
                ? 'missing table definition argument'
                : `expected 1 argument, received ${callArgs.length}`
          };
    if (
      !resolvedTable.ok ||
      resolvedTable.value === null ||
      typeof resolvedTable.value !== 'object' ||
      Array.isArray(resolvedTable.value)
    ) {
      issues.push(
        `cannot statically verify defineSqlTable(${rawArgSummary || '...'}): ${resolvedTable.reason ?? 'expected static object literal'}; inline the table definition or bind it to a static local const`
      );
      continue;
    }

    const parsed = resolvedTable.value;
    const tableName = typeof parsed.name === 'string' ? parsed.name : '(unnamed)';
    if (
      parsed.columns === null ||
      parsed.columns === undefined ||
      typeof parsed.columns !== 'object' ||
      Array.isArray(parsed.columns)
    ) {
      issues.push(`table "${tableName}" has missing or non-static columns definition`);
      continue;
    }
    if (parsed.indexes !== undefined && !Array.isArray(parsed.indexes)) {
      issues.push(`table "${tableName}" has non-static indexes definition`);
      continue;
    }

    const columns = parsed.columns;
    const indexes = parsed.indexes ?? [];
    tables.push({ name: tableName, columns, indexes });

    for (const [colName, colDef] of Object.entries(columns)) {
      if (colDef === null || typeof colDef !== 'object' || Array.isArray(colDef)) {
        issues.push(`table "${tableName}" column "${colName}" must be a static column definition object`);
        continue;
      }
      if (typeof colDef.kind !== 'string') {
        issues.push(`table "${tableName}" column "${colName}" has missing or non-static kind`);
        continue;
      }
      if ((colDef.kind === 'text' || colDef.kind === 'json') && colDef.defaultValue !== undefined) {
        issues.push(
          `table "${tableName}" column "${colName}" (${colDef.kind}) must not declare defaultValue (OceanBase/MySQL ERROR 1101 forbids DEFAULT on LONGTEXT/JSON)`
        );
      }
    }

    for (const idxDef of indexes) {
      if (idxDef === null || typeof idxDef !== 'object' || Array.isArray(idxDef)) {
        issues.push(`table "${tableName}" contains non-static index definition`);
        continue;
      }
      const idxName = typeof idxDef.name === 'string' ? idxDef.name : '(unnamed)';
      if (typeof idxDef.name !== 'string' || idxDef.name.length === 0) {
        issues.push(`table "${tableName}" index "${idxName}" has missing or non-static name`);
      } else if (!/^fg_[a-z0-9_]+$/.test(idxDef.name)) {
        issues.push(
          `table "${tableName}" index "${idxName}" must start with "fg_" and use lowercase ASCII snake_case`
        );
      } else if (Buffer.byteLength(idxDef.name, 'ascii') > 63) {
        issues.push(
          `table "${tableName}" index "${idxName}" exceeds 63 ASCII bytes (PostgreSQL NAMEDATALEN limit)`
        );
      }
      if (!Array.isArray(idxDef.columns)) {
        issues.push(`table "${tableName}" index "${idxName}" has non-static columns list`);
        continue;
      }
      const idxCols = idxDef.columns;
      const idxColNames = [];
      let totalBytes = 0;

      for (const rawCol of idxCols) {
        let colName;
        if (typeof rawCol === 'string') {
          colName = rawCol;
        } else if (
          rawCol !== null &&
          typeof rawCol === 'object' &&
          !Array.isArray(rawCol) &&
          typeof rawCol.column === 'string'
        ) {
          colName = rawCol.column;
          if (
            rawCol.direction !== undefined &&
            rawCol.direction !== 'asc' &&
            rawCol.direction !== 'desc'
          ) {
            issues.push(
              `table "${tableName}" index "${idxName}" has invalid sort direction "${String(rawCol.direction)}" on column "${colName}"`
            );
          }
        } else {
          issues.push(`table "${tableName}" index "${idxName}" contains invalid column reference`);
          continue;
        }
        idxColNames.push(colName);
        const colDef = columns[colName];
        if (colDef === undefined || typeof colDef !== 'object' || colDef === null) {
          continue;
        }
        if (colDef.kind === 'text' || colDef.kind === 'json') {
          issues.push(
            `table "${tableName}" index "${idxName}" cannot index ${colDef.kind} column "${colName}" on OceanBase/MySQL (use bounded varchar instead)`
          );
          continue;
        }
        const colBytes = estimateSqlColumnIndexBytes(colDef);
        if (colBytes !== null) {
          totalBytes += colBytes;
        }
      }

      if (totalBytes > MAX_OB_MYSQL_INDEX_BYTES) {
        issues.push(
          `table "${tableName}" index "${idxName}" (${idxColNames.join(', ')}) estimated width ${totalBytes}B exceeds OceanBase/MySQL utf8mb4 limit (${MAX_OB_MYSQL_INDEX_BYTES}B)`
        );
      }
    }
  }

  return { tables, issues };
};

const LOG_TOPOLOGY_SUITE_CALLEE = 'registerLogTopologyContractSuite';

const REPO_RUNTIME_HELPER_FNS = new Set(['injectRepo', 'runInTransaction', 'getDbRuntime']);

/** 提取领域目录导出的 Repo Token 与 Mongo/SQL Repository 类名，供契约与日志双态测试覆盖校验使用。 */
export const extractExportedDomainRepoSymbols = (domainAbs) => {
  const symbols = new Set();
  for (const rel of ['repo.ts', 'mongo/repo.ts', 'sql/repo.ts']) {
    const abs = path.join(domainAbs, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      continue;
    }
    const clean = stripCommentsPreserveStrings(fs.readFileSync(abs, 'utf8'));
    for (const m of clean.matchAll(
      /\bexport\s+(?:const|class|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g
    )) {
      symbols.add(m[1]);
    }
  }
  return symbols;
};

/**
 * 校验日志域测试文件是否真正接入了可复用的运行期日志双态隔离契约套件 `registerLogTopologyContractSuite`：
 * 1. 必须从 `@fastgpt/dal/db/testing` 导入（禁止本地同名 mock/函数遮蔽）；
 * 2. 必须在顶层或非 skip/todo 的 `describe(...)` 块中可执行地调用 `registerLogTopologyContractSuite({ ... })`；
 * 3. 禁止传入 `requireBothFamilies: false` / `includeMongo: false` / `includePGlite: false` 跳过任一方言族；
 * 4. `writeLogRecord` 与 `readLogRecord` 回调体内必须真实调用领域仓储或 `injectRepo(...)`（绝不依赖 `harness.logDb` 属性存在性断言）。
 */
export const analyzeLogDualModeTestCoverage = ({
  testFiles,
  domainRepoSymbols = new Set()
}) => {
  const reasons = [];
  let hasValidSuiteCall = false;

  for (const file of testFiles) {
    const resolver = createStaticScopeResolver({ sourceText: file.raw });
    const { clean, tokens, matchIdx, scopeTree, importedAliases } = resolver;

    // 1. 解析从 @fastgpt/dal/db/testing 导入的 registerLogTopologyContractSuite 局部别名
    const suiteCallees = new Set();
    for (const [localName, info] of importedAliases) {
      if (
        info.importedName === LOG_TOPOLOGY_SUITE_CALLEE &&
        /(?:^|\/)testing(?:\.ts)?$/.test(info.specifier)
      ) {
        suiteCallees.add(localName);
      }
    }

    if (suiteCallees.size === 0) {
      reasons.push(
        `${file.relPath}: must import "${LOG_TOPOLOGY_SUITE_CALLEE}" from "@fastgpt/dal/db/testing"`
      );
      continue;
    }

    // 收集 repoVars（如 `const repo = injectRepo(XxxToken)`）以便校验 writeLogRecord / readLogRecord 内部确实操作仓储
    const repoHelperNames = new Set(REPO_RUNTIME_HELPER_FNS);
    for (const [localName, info] of importedAliases) {
      if (REPO_RUNTIME_HELPER_FNS.has(info.importedName)) {
        repoHelperNames.add(localName);
      }
    }

    const repoVars = new Set();
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];
      if (tok.type !== 'ident') continue;
      let eqIdx = i + 1;
      if (isPunctTok(tokens[eqIdx], ':')) {
        eqIdx = skipTypeAnnotation({
          tokens,
          matchIdx,
          startTok: eqIdx + 1,
          rangeEnd: tokens.length,
          stopPuncts: new Set(['=', ';', ','])
        });
      }
      if (!isPunctTok(tokens[eqIdx], '=')) continue;
      let rhsIdx = eqIdx + 1;
      if (isIdentTok(tokens[rhsIdx], 'await')) rhsIdx += 1;
      const rhsTok = tokens[rhsIdx];
      if (rhsTok === undefined) continue;
      if (rhsTok.type === 'ident' && repoHelperNames.has(rhsTok.value)) {
        repoVars.add(tok.value);
      } else if (isIdentTok(rhsTok, 'new') && tokens[rhsIdx + 1]?.type === 'ident') {
        const cls = tokens[rhsIdx + 1].value;
        if (domainRepoSymbols.has(cls) || /Repo(?:sitory)?$/.test(cls)) {
          repoVars.add(tok.value);
        }
      }
    }

    // 2. 收集被 describe.skip / describe.todo / it.skip 跳过的区间
    const skippedSpans = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];
      const prev = i > 0 ? tokens[i - 1] : undefined;
      if (isPunctTok(prev, '.') || isPunctTok(prev, '?.')) continue;
      if (!isIdentTok(tok, 'describe') && !isIdentTok(tok, 'it') && !isIdentTok(tok, 'test')) {
        continue;
      }
      let cursor = i + 1;
      let isSkipped = false;
      while (isPunctTok(tokens[cursor], '.') && tokens[cursor + 1]?.type === 'ident') {
        const mod = tokens[cursor + 1].value;
        cursor += 2;
        if (mod === 'skip' || mod === 'todo') {
          isSkipped = true;
        } else if (mod === 'each' && isPunctTok(tokens[cursor], '(') && matchIdx[cursor] !== -1) {
          cursor = matchIdx[cursor] + 1;
        }
      }
      if (isSkipped && isPunctTok(tokens[cursor], '(') && matchIdx[cursor] !== -1) {
        skippedSpans.push({ startTok: i, endTok: matchIdx[cursor] });
      }
    }
    const isInsideSkipped = (tokIdx) =>
      skippedSpans.some((s) => tokIdx >= s.startTok && tokIdx <= s.endTok);

    const callbackExercisesRepository = (rawValue) => {
      const { tokens: cbTokens } = tokenizeCleanJsTs(stripCommentsPreserveStrings(rawValue));
      for (let k = 0; k < cbTokens.length; k += 1) {
        const t = cbTokens[k];
        if (t.type !== 'ident') continue;
        const prev = k > 0 ? cbTokens[k - 1] : undefined;
        const next = k + 1 < cbTokens.length ? cbTokens[k + 1] : undefined;
        if (repoHelperNames.has(t.value) && !isPunctTok(prev, '.') && isPunctTok(next, '(')) {
          return true;
        }
        if (
          domainRepoSymbols.has(t.value) &&
          (isIdentTok(prev, 'new') ||
            isPunctTok(next, '.') ||
            isPunctTok(next, '?.') ||
            isPunctTok(next, '('))
        ) {
          return true;
        }
        if (repoVars.has(t.value) && !isPunctTok(prev, '.') && (isPunctTok(next, '.') || isPunctTok(next, '?.'))) {
          return true;
        }
      }
      return false;
    };

    // 3. 扫描所有可执行的 registerLogTopologyContractSuite(...) 调用并严格校验参数契约
    for (const call of findFunctionCalls({
      tokens,
      matchIdx,
      calleeNames: suiteCallees
    })) {
      if (call.closeParenIdx === -1 || isInsideSkipped(call.calleeIdx)) {
        continue;
      }
      const calleeCharPos = tokens[call.calleeIdx].start;
      const calleeBinding = scopeTree.lookupBinding(call.calleeName, calleeCharPos);
      if (calleeBinding.found && calleeBinding.binding.kind !== 'import') {
        reasons.push(`${file.relPath}: "${call.calleeName}" is shadowed by local mock/binding`);
        continue;
      }

      const enclosingScope = scopeTree.findInnermostScope(calleeCharPos);
      if (enclosingScope.kind === 'function') {
        // 允许在 describe(...) 回调中调用，但拒绝放在从未调用的普通 helper 函数体中
        const beforeOpenTok = call.calleeIdx;
        let inDescribe = false;
        for (let b = 0; b < beforeOpenTok; b += 1) {
          if (isIdentTok(tokens[b], 'describe')) {
            let cur = b + 1;
            while (isPunctTok(tokens[cur], '.') && tokens[cur + 1]?.type === 'ident') {
              cur += 2;
              if (tokens[cur - 1].value === 'each' && isPunctTok(tokens[cur], '(') && matchIdx[cur] !== -1) {
                cur = matchIdx[cur] + 1;
              }
            }
            if (isPunctTok(tokens[cur], '(') && matchIdx[cur] !== -1 && matchIdx[cur] > call.closeParenIdx) {
              inDescribe = true;
              break;
            }
          }
        }
        if (!inDescribe) {
          reasons.push(`${file.relPath}: ${call.calleeName} must be registered at top-level or inside describe()`);
          continue;
        }
      }

      const inner = clean.slice(tokens[call.openParenIdx].end, tokens[call.closeParenIdx].start);
      const callArgs = splitTopLevelComma(inner).filter((arg) => arg.trim().length > 0);
      if (callArgs.length === 0) {
        reasons.push(`${file.relPath}: ${call.calleeName} called without options object`);
        continue;
      }
      const argStartPos = skipWhitespace(clean, tokens[call.openParenIdx].end);
      const objRes = resolver.resolveObjectProperties({
        rawExpr: callArgs[0],
        scopePos: argStartPos
      });
      if (!objRes.ok) {
        reasons.push(`${file.relPath}: cannot inspect options passed to ${call.calleeName}`);
        continue;
      }

      // 禁止关闭任意一族后端校验
      for (const flagKey of ['requireBothFamilies', 'includeMongo', 'includePGlite']) {
        const entry = objRes.props.get(flagKey);
        if (entry !== undefined) {
          const valRes = resolver.resolveValue({
            rawExpr: entry.rawValue,
            scopePos: entry.scopePos
          });
          if (valRes.ok && valRes.value === false) {
            reasons.push(
              `${file.relPath}: ${call.calleeName} must not disable "${flagKey}: false"`
            );
          }
        }
      }

      for (const reqProp of [
        'logCollections',
        'logTables',
        'mongoCollectionName',
        'sqlTableName',
        'writeLogRecord',
        'readLogRecord'
      ]) {
        const entry = objRes.props.get(reqProp);
        if (entry === undefined) {
          reasons.push(`${file.relPath}: ${call.calleeName} missing required option "${reqProp}"`);
        }
      }

      const writeEntry = objRes.props.get('writeLogRecord');
      const readEntry = objRes.props.get('readLogRecord');
      if (writeEntry !== undefined && !callbackExercisesRepository(writeEntry.rawValue)) {
        reasons.push(
          `${file.relPath}: ${call.calleeName}.writeLogRecord must exercise domain repository / injectRepo()`
        );
      }
      if (readEntry !== undefined && !callbackExercisesRepository(readEntry.rawValue)) {
        reasons.push(
          `${file.relPath}: ${call.calleeName}.readLogRecord must exercise domain repository / injectRepo()`
        );
      }

      if (reasons.length === 0) {
        hasValidSuiteCall = true;
      }
    }
  }

  return {
    ok: hasValidSuiteCall && reasons.length === 0,
    details:
      reasons.length > 0
        ? reasons.join('; ')
        : `missing executable ${LOG_TOPOLOGY_SUITE_CALLEE}({ ... }) wiring shared + separate physical isolation checks`
  };
};

/**
 * 发现领域对应的 Service L0 纯内存单测文件，同时识别 `service.unit.test.ts` 与 `service.test.ts`：
 * - 支持直接位于领域对应测试目录的单测；
 * - 支持 `packages/dal/db/repos/<domain>` 与 `packages/service/**\/<domain>/service.ts` 配对的 L0 单测；
 * - 支持显式 `--test` 传入的 `service.unit.test.ts` / `service.test.ts`。
 */
export const findDomainServiceUnitTestFiles = ({
  repoRoot,
  domainRel,
  explicitTestTargets = []
}) => {
  const normalizedDomain = toPosixPath(domainRel).replace(/^\.\//, '').replace(/\/$/, '');
  const serviceFiles = new Set();
  const unitTestFiles = new Set();

  const addIfFile = (set, rel) => {
    const abs = path.resolve(repoRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      set.add(toPosixPath(rel));
    }
  };

  // 1. 领域目录自身含 service.ts 时检查其标准测试目录
  addIfFile(serviceFiles, `${normalizedDomain}/service.ts`);
  const inferredTestDir = inferDomainTestDir(normalizedDomain);
  if (inferredTestDir !== undefined) {
    addIfFile(unitTestFiles, `${inferredTestDir}/service.unit.test.ts`);
    addIfFile(unitTestFiles, `${inferredTestDir}/service.test.ts`);
  }

  // 2. DAL 仓储域（packages/dal/db/repos/<name> 或 pro/admin/src/dal/db/repos/<name>）自动配对同域 Service 与其 L0 单测
  const dalPrefixMatch =
    /^(packages\/dal|pro\/admin\/src\/dal)\/db\/repos\/([^/]+)$/.exec(normalizedDomain);
  if (dalPrefixMatch !== null) {
    const isPro = dalPrefixMatch[1].startsWith('pro/');
    const domainLeaf = dalPrefixMatch[2];
    const serviceRoot = path.join(repoRoot, isPro ? 'pro/admin/src' : 'packages/service');
    const serviceTestRoot = path.join(repoRoot, isPro ? 'pro/admin/test' : 'packages/service/test');

    for (const abs of walkFiles(serviceRoot, (f) => {
      const posix = toPosixPath(f);
      return !isTestOrMigrationFile(posix) && posix.endsWith(`/${domainLeaf}/service.ts`);
    })) {
      const rel = toPosixPath(path.relative(repoRoot, abs));
      serviceFiles.add(rel);
      const pairedTestDir = inferDomainTestDir(path.posix.dirname(rel));
      if (pairedTestDir !== undefined) {
        addIfFile(unitTestFiles, `${pairedTestDir}/service.unit.test.ts`);
        addIfFile(unitTestFiles, `${pairedTestDir}/service.test.ts`);
      }
    }

    for (const abs of walkFiles(serviceTestRoot, (f) => {
      const posix = toPosixPath(f);
      return (
        posix.endsWith(`/${domainLeaf}/service.unit.test.ts`) ||
        posix.endsWith(`/${domainLeaf}/service.test.ts`)
      );
    })) {
      unitTestFiles.add(toPosixPath(path.relative(repoRoot, abs)));
    }
  }

  // 3. 显式 --test 传入的 Service L0 单测文件
  for (const target of explicitTestTargets) {
    const rel = toPosixPath(target).replace(/^\.\//, '');
    const base = path.posix.basename(rel);
    if (base === 'service.unit.test.ts' || base === 'service.test.ts') {
      addIfFile(unitTestFiles, rel);
    }
  }

  return {
    serviceFiles: [...serviceFiles].sort(),
    unitTestFiles: [...unitTestFiles].sort()
  };
};

export { stripCommentsPreserveStrings };
