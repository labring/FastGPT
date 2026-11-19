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

const stripTsAssertion = (raw) =>
  raw
    .trim()
    .replace(/\s+as\s+[A-Za-z0-9_$.<>[\]\s|&]+$/, '')
    .replace(/!$/, '')
    .trim();

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
    ownershipErrors
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
      raw: block
    });

    i = end + 1;
  }

  return {
    indexes: results,
    declaredSchemas: bindings.declaredSchemas,
    modelRegistrations: bindings.modelRegistrations,
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
 * 静态解析 `sql/table.ts` 中的全部 `defineSqlTable({...})` 声明并校验 OceanBase/MySQL 硬约束：
 * - 禁止给 `text` / `json` 列声明 `defaultValue`（OB/MySQL `ERROR 1101`）；
 * - 禁止对 `text` / `json` 列建普通 B-Tree 索引；
 * - 校验单条普通/唯一复合索引在 `utf8mb4` 下的最大估算字节宽不超过 3072 字节。
 */
export const analyzeSqlTableDefinitions = (sourceText) => {
  const clean = stripCommentsPreserveStrings(sourceText);
  const tables = [];
  const issues = [];
  const callRegex = /\bdefineSqlTable\s*\(/g;

  for (const match of clean.matchAll(callRegex)) {
    const openParenIdx = match.index + match[0].length - 1;
    const parenSeg = scanBalancedSegment(clean, {
      startIdx: openParenIdx,
      openChar: '(',
      closeChar: ')'
    });
    if (parenSeg === null) {
      continue;
    }

    const argExpr = stripTsAssertion(parenSeg.inner);
    const parsed = parseJsValue(argExpr);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || 'expr' in parsed) {
      continue;
    }

    const tableName = typeof parsed.name === 'string' ? parsed.name : '(unnamed)';
    const columns =
      parsed.columns !== null && typeof parsed.columns === 'object' && !Array.isArray(parsed.columns)
        ? parsed.columns
        : {};
    const indexes = Array.isArray(parsed.indexes) ? parsed.indexes : [];

    tables.push({ name: tableName, columns, indexes });

    for (const [colName, colDef] of Object.entries(columns)) {
      if (colDef === null || typeof colDef !== 'object' || Array.isArray(colDef)) {
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
        continue;
      }
      const idxName = typeof idxDef.name === 'string' ? idxDef.name : '(unnamed)';
      const idxCols = Array.isArray(idxDef.columns) ? idxDef.columns : [];
      let totalBytes = 0;

      for (const colName of idxCols) {
        if (typeof colName !== 'string') {
          continue;
        }
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
          `table "${tableName}" index "${idxName}" (${idxCols.join(', ')}) estimated width ${totalBytes}B exceeds OceanBase/MySQL utf8mb4 limit (${MAX_OB_MYSQL_INDEX_BYTES}B)`
        );
      }
    }
  }

  return { tables, issues };
};

export { stripCommentsPreserveStrings };
